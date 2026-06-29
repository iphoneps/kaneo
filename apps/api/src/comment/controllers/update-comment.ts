import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { commentTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import notifyMentions from "../../notification/controllers/notify-mentions";
import { deleteOrphanedAssets } from "../../storage/cleanup-assets";
import {
  extractMentionUserIds,
  toPlainSnippet,
} from "../../utils/extract-mentions";

async function updateComment(userId: string, id: string, content: string) {
  const [existing] = await db
    .select({
      userId: commentTable.userId,
      taskId: commentTable.taskId,
      content: commentTable.content,
    })
    .from(commentTable)
    .where(eq(commentTable.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Comment not found" });
  }

  if (existing.userId !== userId) {
    throw new HTTPException(403, {
      message: "Only the author can edit this comment",
    });
  }

  const [task] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, existing.taskId))
    .limit(1);

  const [updated] = await db
    .update(commentTable)
    .set({ content })
    .where(eq(commentTable.id, id))
    .returning();

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update comment" });
  }

  if (task) {
    await publishEvent("comment.updated", {
      ...updated,
      taskId: updated.taskId,
      projectId: task.projectId,
      userId,
    });
  }

  const previousMentions = new Set(extractMentionUserIds(existing.content));
  const addedMentions = extractMentionUserIds(content).filter(
    (mentionId) => !previousMentions.has(mentionId),
  );
  if (addedMentions.length > 0) {
    void notifyMentions({
      mentionedUserIds: addedMentions,
      actorUserId: userId,
      taskId: updated.taskId,
      sourceType: "comment",
      snippet: toPlainSnippet(content),
    });
  }

  deleteOrphanedAssets(existing.content, content, {
    taskId: existing.taskId,
  }).catch(() => {});

  return updated;
}

export default updateComment;
