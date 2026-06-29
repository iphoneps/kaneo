import { client } from "@kaneo/libs";

export type CommentSource = "comment" | "activity";

export type DeleteCommentRequest = {
  commentId: string;
  // Which store the comment lives in, so we hit the right endpoint:
  // "comment" -> /comment/:id (API/MCP comments), "activity" -> /activity
  // (web-created comments). Defaults to "activity" for back-compat.
  source?: CommentSource;
};

async function deleteComment({ commentId, source }: DeleteCommentRequest) {
  const response =
    source === "comment"
      ? await client.comment[":id"].$delete({ param: { id: commentId } })
      : await client.activity.comment.$delete({
          json: { activityId: commentId },
        });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default deleteComment;
