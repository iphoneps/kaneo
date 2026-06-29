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
  }));

  const merged = [...activities, ...commentActivities].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  merged.forEach((x) => {
    if (x.content) {
      x.content = x.content.replace(/\n+/g, "\n");
    }
  });

  return merged;
}

export default getActivitiesFromTaskId;
