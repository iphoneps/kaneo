import { desc, eq } from "drizzle-orm";
import db from "../../database";
import { activityTable, commentTable } from "../../database/schema";

async function getActivitiesFromTaskId(taskId: string) {
  const activities = await db.query.activityTable.findMany({
    where: eq(activityTable.taskId, taskId),
    orderBy: [desc(activityTable.createdAt)],
  });

  // Comments created via the API/MCP are stored in commentTable, not
  // activityTable. Surface them in the same timeline so they render in the UI.
  const comments = await db.query.commentTable.findMany({
    where: eq(commentTable.taskId, taskId),
  });

  const commentActivities = comments.map((comment) => ({
    id: comment.id,
    taskId: comment.taskId,
    type: "comment",
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    userId: comment.userId,
    content: comment.content,
    eventData: null,
    externalUserName: null,
    externalUserAvatar: null,
    externalSource: null,
    externalUrl: null,
    // Marks where this row lives so the UI can route edits/deletes to the
    // right endpoint: "comment" -> /comment/:id, "activity" -> /activity.
    commentSource: "comment" as const,
  }));

  const merged = [
    ...activities.map((activity) => ({
      ...activity,
      commentSource: "activity" as const,
    })),
    ...commentActivities,
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  merged.forEach((x) => {
    if (x.content) {
      // Collapse only runs of 3+ newlines; keep blank lines (\n\n) so that
      // markdown paragraph breaks survive. Flattening every run to a single
      // \n turned paragraph breaks into <br> and let lists swallow the
      // following paragraph (lazy continuation), which is what made comments
      // render as one cramped block.
      x.content = x.content.replace(/\n{3,}/g, "\n\n");
    }
  });

  return merged;
}

export default getActivitiesFromTaskId;
