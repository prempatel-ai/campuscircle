import React, { useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";

interface Comment {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  depth: number;
  score: number;
  is_deleted: boolean;
  created_at: string;
}

interface ReplyComposerProps {
  postId: string;
  parentId?: string | null;
  onSuccess: (newComment: Comment) => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const ReplyComposer: React.FC<ReplyComposerProps> = ({
  postId,
  parentId = null,
  onSuccess,
  onCancel,
  placeholder = "Write your reply...",
  autoFocus = false,
}) => {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest<Comment>(`/api/v1/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          content: content.trim(),
          parent_id: parentId,
        }),
      });
      setContent("");
      onSuccess(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to post comment.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 w-full mt-2">
      {error && (
        <div className="bg-red-50 border-l-3 border-red-500 p-2 rounded-r-lg">
          <p className="text-xs font-sans text-red-700 font-semibold">{error}</p>
        </div>
      )}

      <textarea
        required
        rows={3}
        autoFocus={autoFocus}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-background border border-border-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-sans text-sm text-ink resize-none placeholder:text-ink/40"
      />

      <div className="flex justify-end gap-2 text-xs">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-3.5 py-2 font-sans font-semibold text-ink/75 hover:bg-background border border-border-muted/50 rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading || !content.trim()}
          className="px-4 py-2 bg-primary hover:bg-[#1F3E23] disabled:opacity-50 text-white font-sans font-bold rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
        >
          {isLoading ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              Posting...
            </>
          ) : (
            "Reply"
          )}
        </button>
      </div>
    </form>
  );
};
