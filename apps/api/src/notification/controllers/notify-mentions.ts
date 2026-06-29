import { eq } from "drizzle-orm";
import db from "../../database";
import {
  projectTable,
  taskTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import createNotification from "./create-notification";

type NotifyMentionsArgs = {
  mentionedUserIds: string[];
  actorUserId: string;
  taskId: string;
  sourceType: "comment" | "description";
  snippet: string;
};

// Notify users mentioned in a comment or task description. Only members of the
// task's workspace are notified, the actor is never notified for their own
// mention, and ids are deduped. Failures are swallowed so a notification error
// can never fail the underlying comment/description save.
async function notifyMentions({
  mentionedUserIds,
  actorUserId,
  taskId,
  sourceType,
  snippet,
}: NotifyMentionsArgs): Promise<void> {
  try {
    const targets = [...new Set(mentionedUserIds)].filter(
      (id) => id && id !== actorUserId,
    );
    if (targets.length === 0) return;

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
    const recipients = targets.filter((id) => memberIds.has(id));
    if (recipients.length === 0) return;

    const [actor] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, actorUserId))
      .limit(1);
    const actorName = actor?.name || "Someone";

    const title =
      sourceType === "description"
        ? `${actorName} mentioned you in a task description`
        : `${actorName} mentioned you in a comment`;

    await Promise.allSettled(
      recipients.map((userId) =>
        createNotification({
          userId,
          type: "mention",
          title,
          content: snippet || null,
          resourceId: taskId,
          resourceType: "task",
          eventData: { actorName, sourceType },
        }),
      ),
    );
  } catch (error) {
    console.error("Failed to notify mentions", { taskId, error });
  }
}

export default notifyMentions;
