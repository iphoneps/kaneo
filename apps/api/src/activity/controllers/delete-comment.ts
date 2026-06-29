import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { activityTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { deleteOrphanedAssets } from "../../storage/cleanup-assets";

async function deleteComment(userId: string, id: string, canModerate = false) {
  const [existing] = await db
    .select({
      id: activityTable.id,
      userId: activityTable.userId,
      content: activityTable.content,
      taskId: activityTable.taskId,
    })
    .from(activityTable)
    .where(eq(activityTable.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Comment not found" });
  }

  // Members may delete only their own comments; workspace admins/owners
  // (canModerate === true) may delete any comment.
  if (existing.userId !== userId && !canModerate) {
    throw new HTTPException(403, {
      message: "Only the author or a workspace admin can delete this comment",
    });
  }

  const [deletedComment] = await db
    .delete(activityTable)
    .where(eq(activityTable.id, id))
    .returning();

  if (!deletedComment) {
    throw new HTTPException(404, { message: "Comment not found" });
  }

  const [task] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, deletedComment.taskId))
    .limit(1);

  if (task) {
    await publishEvent("comment.deleted", {
      ...deletedComment,
      projectId: task.projectId,
      userId,
    });
  }

  deleteOrphanedAssets(existing.content, null, {
    taskId: existing.taskId,
  }).catch(() => {});

  return deletedComment;
}

export default deleteComment;
