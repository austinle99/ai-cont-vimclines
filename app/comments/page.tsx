import { create, getComments } from "@/app/action";
import CommentForm from "./CommentForm";

export default async function CommentsPage() {
  const comments = await getComments();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Comments</h1>
      
      <CommentForm />
      
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Recent Comments</h2>
        {comments.length === 0 ? (
          <p className="text-gray-500">No comments yet. Add the first one above!</p>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="bg-gray-50 p-4 rounded-lg border">
                <p className="text-gray-800 mb-2">{comment.content}</p>
                <p className="text-sm text-gray-500">
                  {new Date(comment.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}