import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { activityTable, taskTable, userTable } from "../../database/schema";
import { publishEvent } from "../../events";
import notifyCommentParticipants from "../../notification/controllers/notify-comment-participants";
import notifyMentions from "../../notification/controllers/notify-mentions";
import {
  extractMentionUserIds,
  tokensToPlainText,
  toPlainSnippet,
} from "../../utils/extract-mentions";

async function createComment(taskId: string, userId: string, content: string) {
  const [activity] = await db
    .insert(activityTable)
    .values({
      taskId,
      type: "comment",
      userId,
      content,
    })
    .returning();

  if (!activity) {
    throw new HTTPException(500, {
      message: "Failed to create activity",
    });
  }

  const [user] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId));

  const [task] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId));

  if (task) {
    await publishEvent("task.comment_created", {
      ...activity,
      comment: `**${user?.name}** commented:\n> ${tokensToPlainText(content)}`,
      projectId: task.projectId,
    });
  }

  const mentionedUserIds = extractMentionUserIds(content);

  void notifyMentions({
    mentionedUserIds,
    actorUserId: userId,
    taskId,
    sourceType: "comment",
    snippet: toPlainSnippet(content),
  });

  void notifyCommentParticipants({
    actorUserId: userId,
    taskId,
    excludeUserIds: mentionedUserIds,
    snippet: toPlainSnippet(content),
  });

  return activity;
}

export default createComment;
