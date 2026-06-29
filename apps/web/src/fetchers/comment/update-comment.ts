import { client } from "@kaneo/libs";
import type { CommentSource } from "./delete-comment";

export type UpdateCommentRequest = {
  commentId: string;
  comment: string;
  // Which store the comment lives in, so we hit the right endpoint:
  // "comment" -> /comment/:id (API/MCP comments), "activity" -> /activity
  // (web-created comments). Defaults to "activity" for back-compat.
  source?: CommentSource;
};

async function updateComment({
  commentId,
  comment,
  source,
}: UpdateCommentRequest) {
  const response =
    source === "comment"
      ? await client.comment[":id"].$put({
          param: { id: commentId },
          json: { content: comment },
        })
      : await client.activity.comment.$put({
          json: { activityId: commentId, comment },
        });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default updateComment;
