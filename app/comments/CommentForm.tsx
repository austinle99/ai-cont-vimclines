"use client";

import { useState } from "react";

export default function CommentForm() {
  const [message, setMessage] = useState("Comments are temporarily disabled during system maintenance.");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Comment functionality is currently disabled. Please try again later.");
  };

  return (
    <>
      <form id="commentForm" onSubmit={handleSubmit} className="space-y-4 opacity-50">
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
            Comment Content
          </label>
          <textarea
            id="content"
            name="content"
            disabled
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 cursor-not-allowed"
            placeholder="Comments are temporarily disabled..."
          />
        </div>
        
        <button
          type="submit"
          disabled
          className="bg-gray-400 text-white font-medium py-2 px-4 rounded-md cursor-not-allowed"
        >
          Add Comment (Disabled)
        </button>
      </form>
      
      {message && (
        <div className="mt-4 p-3 rounded-md bg-yellow-100 text-yellow-700 border border-yellow-300">
          {message}
        </div>
      )}
    </>
  );
}