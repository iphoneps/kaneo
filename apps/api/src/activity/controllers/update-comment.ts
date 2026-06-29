import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { activityTable, taskTable } from "../../database/schema";
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
      id: activityTable.id,
      content: activityTable.content,
      taskId: activityTable.taskId,
    })
    .from(activityTable)
    .where(and(eq(activityTable.id, id), eq(activityTable.userId, userId)))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, {
      message: "Comment not found or you are not the author",
    });
  }

  const [updated] = await db
    .update(activityTable)
    .set({ content })
    .where(and(eq(activityTable.id, id), eq(activityTable.userId, userId)))
    .returning();

  if (!updated) {
    throw new HTTPException(404, {
      message: "Comment not found or you are not the author",
    });
  }

  const [task] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, updated.taskId))
    .limit(1);

  if (task) {
    await publishEvent("comment.updated", {
      ...updated,
      projectId: task.projectId,
      userId,
    });
  }

  // Only notify users newly mentioned by this edit, not everyone already
  // mentioned in the previous version.
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
