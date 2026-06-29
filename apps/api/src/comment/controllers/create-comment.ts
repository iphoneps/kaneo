import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { commentTable, taskTable, userTable } from "../../database/schema";
import { publishEvent } from "../../events";
import notifyMentions from "../../notification/controllers/notify-mentions";
import {
  extractMentionUserIds,
  tokensToPlainText,
  toPlainSnippet,
} from "../../utils/extract-mentions";

async function createComment(taskId: string, userId: string, content: string) {
  const [task] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const [comment] = await db
    .insert(commentTable)
    .values({
      taskId,
      userId,
      content,
    })
    .returning();

  if (!comment) {
    throw new HTTPException(500, { message: "Failed to create comment" });
  }

  const [user] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  await publishEvent("comment.created", {
    ...comment,
    taskId: comment.taskId,
    projectId: task.projectId,
    userId,
  });

  // Notify outbound integrations (Slack/Discord/Telegram/webhook/…). They
  // subscribe to task.comment_created — the web UI emits it from the activity
  // controller, but comments created via the API/MCP live in a different
  // store and must emit it too, or they reach no integration.
  await publishEvent("task.comment_created", {
    taskId: comment.taskId,
    userId,
    comment: `**${user?.name}** commented:\n> ${tokensToPlainText(content)}`,
    projectId: task.projectId,
  });

  void notifyMentions({
    mentionedUserIds: extractMentionUserIds(content),
    actorUserId: userId,
    taskId: comment.taskId,
    sourceType: "comment",
    snippet: toPlainSnippet(content),
  });

  return comment;
}

export default createComment;
