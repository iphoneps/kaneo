import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import notifyMentions from "../../notification/controllers/notify-mentions";
import { deleteOrphanedAssets } from "../../storage/cleanup-assets";
import {
  extractMentionUserIds,
  toPlainSnippet,
} from "../../utils/extract-mentions";

async function updateTaskDescription({
  id,
  description,
  currentUserId,
}: {
  id: string;
  description: string;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  const [updatedTask] = await db
    .update(taskTable)
    .set({ description })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task description",
    });
  }

  await publishEvent("task.description_changed", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    userId: currentUserId,
    oldDescription: existingTask.description,
    newDescription: description,
    type: "description_changed",
  });

  // Descriptions save on a debounce, so only notify users newly mentioned by
  // this change — anyone already mentioned in the previous description is in
  // the old set and won't be re-notified on each keystroke save.
  const previousMentions = new Set(
    extractMentionUserIds(existingTask.description),
  );
  const addedMentions = extractMentionUserIds(description).filter(
    (mentionId) => !previousMentions.has(mentionId),
  );
  if (addedMentions.length > 0) {
    void notifyMentions({
      mentionedUserIds: addedMentions,
      actorUserId: currentUserId,
      taskId: id,
      sourceType: "description",
      snippet: toPlainSnippet(description),
    });
  }

  deleteOrphanedAssets(existingTask.description, description, {
    taskId: id,
  }).catch(() => {});

  return updatedTask;
}

export default updateTaskDescription;
