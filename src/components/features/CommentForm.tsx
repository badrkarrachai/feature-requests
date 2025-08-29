"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, AlertCircle, SendHorizonal } from "lucide-react";

interface CommentFormProps {
  featureId: string;
  email: string;
  name: string;
  appSlug: string;
  onCommentAdded?: (newComment: any) => void; // Pass the new comment data
  parentCommentId?: string | null; // For replies
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  isFocused?: boolean;
  isReply?: boolean; // Whether this is a reply or a new comment
}

export default function CommentForm({
  featureId,
  email,
  name,
  appSlug,
  onCommentAdded,
  parentCommentId = null,
  placeholder = "Leave a comment",
  onFocus,
  onBlur,
  isFocused = false,
  isReply = false,
}: CommentFormProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!comment.trim()) {
      setError("Please enter a comment");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/features/${featureId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          app_slug: appSlug,
          content: comment.trim(),
          email,
          name,
          parent_comment_id: parentCommentId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to add comment");
      }

      const responseData = await res.json();

      // Success - clear the form and pass the new comment data to parent
      setComment("");
      if (onCommentAdded && responseData.comment) {
        onCommentAdded(responseData.comment);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={placeholder}
        className=" min-h-[2.5rem] border-gray-200 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400 transition-all duration-200 resize-none"
        disabled={isSubmitting}
        onFocus={onFocus}
        onBlur={onBlur}
        maxLength={500}
      />

      {error && (
        <div className="text-xs">
          <div className="text-red-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </div>
        </div>
      )}

      {(isFocused || comment.length > 0) && (
        <div className="flex justify-end animate-in slide-in-from-bottom-1 duration-200">
          <Button
            type="submit"
            disabled={isSubmitting || comment.length === 0 || comment.length > 500}
            size="lg"
            className="flex items-center gap-1.5 h-9 px-2 text-xs text-white font-semibold"
          >
            {isSubmitting ? (
              <div className="w-3 h-3 border-2 border-white dark:border-gray-300 border-t-transparent rounded-full animate-spin" />
            ) : (
              <SendHorizonal className="w-3 h-3" />
            )}
            {isSubmitting ? (isReply ? "Replying..." : "Adding...") : isReply ? "Reply" : "Comment"}
          </Button>
        </div>
      )}
    </form>
  );
}
