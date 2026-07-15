import { and, eq, isNotNull } from "drizzle-orm";
import db from "../../database";
import {
  activityTable,
  commentTable,
  projectTable,
  taskTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import createNotification from "./create-notification";

type NotifyCommentParticipantsArgs = {
  actorUserId: string;
  taskId: string;
  excludeUserIds: string[];
  snippet: string;
};

// Notify the task assignee and everyone who previously commented on the task
// when a new comment lands. Mentioned users are excluded (they already get a
// mention notification), the actor never hears about their own comment, and
// only workspace members are notified. Comments live in two stores (activity
// for the web UI, comment for the API/MCP), so participants are read from
// both. Failures are swallowed so a notification error can never fail the
// underlying comment save.
async function notifyCommentParticipants({
  actorUserId,
  taskId,
  excludeUserIds,
  snippet,
}: NotifyCommentParticipantsArgs): Promise<void> {
  try {
    const [task] = await db
      .select({ assigneeId: taskTable.userId, title: taskTable.title })
      .from(taskTable)
      .where(eq(taskTable.id, taskId))
      .limit(1);
    if (!task) return;

    const [activityCommenters, apiCommenters] = await Promise.all([
      db
        .select({ userId: activityTable.userId })
        .from(activityTable)
        .where(
          and(
            eq(activityTable.taskId, taskId),
            eq(activityTable.type, "comment"),
            isNotNull(activityTable.userId),
          ),
        ),
      db
        .select({ userId: commentTable.userId })
        .from(commentTable)
        .where(eq(commentTable.taskId, taskId)),
    ]);

    const excluded = new Set([actorUserId, ...excludeUserIds]);
    const targets = new Set<string>();
    if (task.assigneeId) targets.add(task.assigneeId);
    for (const { userId } of [...activityCommenters, ...apiCommenters]) {
      if (userId) targets.add(userId);
    }
    for (const id of excluded) targets.delete(id);
    if (targets.size === 0) return;

    // All members of the workspace this task belongs to.
    const members = await db
      .select({ userId: workspaceUserTable.userId })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .innerJoin(
        workspaceUserTable,
        eq(workspaceUserTable.workspaceId, projectTable.workspaceId),
      )
      .where(eq(taskTable.id, taskId));

    const memberIds = new Set(members.map((m) => m.userId));
    const recipients = [...targets].filter((id) => memberIds.has(id));
    if (recipients.length === 0) return;

    const [actor] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, actorUserId))
      .limit(1);
    const actorName = actor?.name || "Someone";

    const title = task.title
      ? `${actorName} commented on "${task.title}"`
      : `${actorName} commented on a task`;

    await Promise.allSettled(
      recipients.map((userId) =>
        createNotification({
          userId,
          type: "comment_created",
          title,
          content: snippet || null,
          resourceId: taskId,
          resourceType: "task",
          eventData: { actorName, taskTitle: task.title },
        }),
      ),
    );
  } catch (error) {
    console.error("Failed to notify comment participants", { taskId, error });
  }
}

export default notifyCommentParticipants;
