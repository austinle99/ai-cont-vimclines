"use client";

import { create } from "@/app/action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function CommentForm() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      try {
        await create(formData);
        setMessage("Comment added successfully!");
        // Clear the form
        const form = document.getElementById("commentForm") as HTMLFormElement;
        form?.reset();
        // Refresh the page to show new comment
        router.refresh();
      } catch (error) {
        setMessage("Error adding comment. Please try again.");
        console.error(error);
      }
    });
  };

  return (
    <>
      <form id="commentForm" action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
            Comment Content
          </label>
          <textarea
            id="content"
            name="content"
            required
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter your comment here..."
          />
        </div>
        
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          {isPending ? "Adding Comment..." : "Add Comment"}
        </button>
      </form>
      
      {message && (
        <div className={`mt-4 p-3 rounded-md ${
          message.includes("successfully") 
            ? "bg-green-100 text-green-700 border border-green-300" 
            : "bg-red-100 text-red-700 border border-red-300"
        }`}>
          {message}
        </div>
      )}
    </>
  );
}