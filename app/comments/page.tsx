import { getComments } from "@/app/action";
import CommentForm from "./CommentForm";

export default async function CommentsPage() {
  const comments = await getComments();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Comments</h1>
      
      <div className="mb-6 p-4 bg-yellow-100 border border-yellow-300 rounded-md">
        <p className="text-yellow-800">
          <strong>Note:</strong> Comment functionality is temporarily disabled during system maintenance.
        </p>
      </div>
      
      <CommentForm />
      
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Recent Comments</h2>
        <p className="text-gray-500">Comments are temporarily unavailable.</p>
      </div>
    </div>
  );
}