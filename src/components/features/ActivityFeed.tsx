"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
// Bootstrap Heart Icons
const HeartIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15" />
  </svg>
);

const HeartFillIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className={className} viewBox="0 0 16 16">
    <path fillRule="evenodd" d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314" />
  </svg>
);

import { MessageSquare, CheckCircle, Clock, AlertCircle, ChevronDown, MoreHorizontal, SortAsc, SortDesc, Sparkles } from "lucide-react";
import { STATUS_TEXT } from "@/lib/utils/index";
import type { Activity, Comment } from "@/types";
import CommentForm from "./CommentForm";

// Loading Components
const LoadingSpinner = ({ size = "sm", className = "" }: { size?: "xs" | "sm" | "md" | "lg"; className?: string }) => {
  const sizeClasses = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return (
    <div className={`animate-spin ${sizeClasses[size]} ${className}`}>
      <svg className="w-full h-full" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
};

const LoadMoreIndicator = ({ isVisible }: { isVisible: boolean }) => {
  if (!isVisible) return null;

  return (
    <div className="flex items-center justify-center py-6">
      <div className="flex items-center space-x-3 px-4 py-2 rounded-full bg-gray-50 border border-gray-200">
        <LoadingSpinner size="sm" className="text-blue-600" />
        <span className="text-sm text-gray-600 font-medium">Loading more comments...</span>
      </div>
    </div>
  );
};

const EndOfListIndicator = ({ show, count }: { show: boolean; count: number }) => {
  if (!show || count === 0 || count <= 10) return null;

  return (
    <div className="flex items-center justify-center py-8">
      <div className="flex flex-col items-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-100 to-blue-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-sm font-medium text-gray-700">You're all caught up!</div>
        <div className="text-xs text-gray-500">You've seen all {count} comments</div>
      </div>
    </div>
  );
};

interface ActivityFeedProps {
  featureId: string;
  email: string;
  name: string;
  initialComments?: any[];
  initialCommentsMetadata?: { total: number; hasMore: boolean };
  onAddComment?: (addCommentFn: (comment: any) => void) => void;
}

// Sort configuration
const sortConfig = {
  newest: {
    label: "Newest first",
    icon: Sparkles,
  },
  oldest: {
    label: "Oldest first",
    icon: Clock,
  },
};

export default function ActivityFeed({ featureId, email, name, initialComments = [], initialCommentsMetadata, onAddComment }: ActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loadingMoreReplies, setLoadingMoreReplies] = useState<string | null>(null);

  // Request tracking for race condition protection
  const requestIdRef = useRef(0);

  // Function to add a new comment locally to the UI
  const addCommentLocally = useCallback(
    (newComment: any) => {
      const commentActivity = {
        id: newComment.id,
        type: "comment" as const,
        content: newComment.content,
        created_at: newComment.created_at,
        author_name: newComment.author_name,
        author_email: newComment.author_email,
        author_image_url: newComment.author_image_url,
        is_deleted: newComment.is_deleted || false,
        likes_count: newComment.likes_count || 0,
        replies_count: newComment.replies_count || 0,
        edited_at: newComment.edited_at,
        user_has_liked: false, // New comment, user hasn't liked it yet
      };

      setActivities((prev) => {
        // Add to the beginning if sorting by newest, end if sorting by oldest
        if (sortBy === "newest") {
          return [commentActivity, ...prev];
        } else {
          return [...prev, commentActivity];
        }
      });

      // Update pagination metadata (we now have one more comment)
      setCurrentPage(1); // Reset to first page since we added a new comment
    },
    [sortBy]
  );

  // Function to handle reply submission
  const handleReplyAdded = useCallback(
    (newReply: any) => {
      // Convert reply to activity format and add it to the feed
      const replyActivity = {
        id: newReply.id,
        type: "comment" as const,
        content: newReply.content,
        created_at: newReply.created_at,
        author_name: newReply.author_name,
        author_email: newReply.author_email,
        author_image_url: newReply.author_image_url,
        is_deleted: newReply.is_deleted || false,
        likes_count: newReply.likes_count || 0,
        replies_count: newReply.replies_count || 0,
        edited_at: newReply.edited_at,
        user_has_liked: false, // New reply, user hasn't liked it yet
        parent_comment_id: newReply.parent_id || newReply.parent_comment_id, // Try both field names
      };

      setActivities((prev) => {
        // For replies, insert them right after their parent comment
        if (replyActivity.parent_comment_id) {
          const parentIndex = prev.findIndex((activity) => activity.id === replyActivity.parent_comment_id);
          if (parentIndex !== -1) {
            // Find the last reply to this parent (or the parent itself if no replies yet)
            let insertIndex = parentIndex + 1;
            while (insertIndex < prev.length && prev[insertIndex].parent_comment_id === replyActivity.parent_comment_id) {
              insertIndex++;
            }

            const newActivities = [...prev];
            newActivities.splice(insertIndex, 0, replyActivity);
            return newActivities;
          }
        }

        // Fallback: Add to the beginning if sorting by newest, end if sorting by oldest
        if (sortBy === "newest") {
          return [replyActivity, ...prev];
        } else {
          return [...prev, replyActivity];
        }
      });

      // Close the reply form
      setReplyingTo(null);
    },
    [sortBy]
  );

  // Function to load more replies for a specific comment
  const handleLoadMoreReplies = useCallback(
    async (commentId: string) => {
      setLoadingMoreReplies(commentId);

      try {
        // Find the main comment to get current reply count
        const mainCommentIndex = activities.findIndex((activity) => activity.id === commentId);
        if (mainCommentIndex === -1) return;

        const mainComment = activities[mainCommentIndex];
        const currentReplyCount = activities.filter((activity) => activity.parent_comment_id === commentId).length;

        const res = await fetch(
          `/api/features/${featureId}/comments/${commentId}/replies?email=${encodeURIComponent(email)}&name=${encodeURIComponent(
            name
          )}&offset=${currentReplyCount}&limit=10`
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();

        // Convert new replies to activity format
        const newReplyActivities: Activity[] = (data.replies || []).map((reply: Comment & { user_has_liked?: boolean }) => ({
          id: reply.id,
          type: "comment" as const,
          content: reply.content,
          created_at: reply.created_at,
          author_name: reply.author_name,
          author_email: reply.author_email,
          author_image_url: reply.author_image_url,
          is_deleted: reply.is_deleted,
          likes_count: reply.likes_count,
          replies_count: reply.replies_count,
          edited_at: reply.edited_at,
          user_has_liked: reply.user_has_liked || false,
          parent_comment_id: reply.parent_id || commentId, // Use reply.parent_id or fallback to commentId
        }));

        // Insert new replies after the main comment and any existing replies
        setActivities((prev) => {
          const newActivities = [...prev];

          // Find where to insert the new replies
          let insertIndex = mainCommentIndex + 1;

          // Skip over any existing replies to this comment
          while (insertIndex < newActivities.length && newActivities[insertIndex].parent_comment_id === commentId) {
            insertIndex++;
          }

          // Insert new replies at the correct position
          newActivities.splice(insertIndex, 0, ...newReplyActivities);

          // Update the main comment's replies_has_more flag and total count
          const updatedMainComment = {
            ...newActivities[mainCommentIndex],
            replies_has_more: data.has_more,
            replies_total_count: data.total_count, // Update with latest total from API
          };
          newActivities[mainCommentIndex] = updatedMainComment;

          return newActivities;
        });
      } catch (error) {
        console.error("Error loading more replies:", error);
      } finally {
        setLoadingMoreReplies(null);
      }
    },
    [featureId, email, name, activities]
  );

  // Expose the addCommentLocally function to parent component
  useEffect(() => {
    if (onAddComment) {
      onAddComment(addCommentLocally);
    }
  }, [onAddComment, addCommentLocally]);

  // Load a specific page with race condition protection
  const fetchPage = useCallback(
    async (pageNum: number, isLoadMore = false) => {
      const requestId = ++requestIdRef.current;

      // Clear previous errors when starting new request
      if (!isLoadMore) {
        setError(null);
      }

      try {
        const res = await fetch(
          `/api/features/${featureId}/comments?email=${encodeURIComponent(email)}&name=${encodeURIComponent(
            name
          )}&sort=${sortBy}&limit=10&page=${pageNum}`,
          { cache: "no-store" }
        );

        // Check if this request is still the latest
        if (requestId !== requestIdRef.current) {
          return; // Abort if superseded by newer request
        }

        if (!res.ok) {
          let errorMessage = "Failed to load activity";
          try {
            const errorData = await res.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            // Use default error message if response isn't JSON
          }
          throw new Error(errorMessage);
        }

        const data = await res.json();

        // Double-check request is still current after async operation
        if (requestId !== requestIdRef.current) {
          return; // Abort if superseded
        }

        // Convert comments with replies to activity format
        const commentActivities: Activity[] = [];

        (data.comments || []).forEach(
          (comment: Comment & { user_has_liked?: boolean; replies?: { items: any[]; has_more: boolean; total_count: number } }) => {
            // Add main comment
            commentActivities.push({
              id: comment.id,
              type: "comment" as const,
              content: comment.content,
              created_at: comment.created_at,
              author_name: comment.author_name,
              author_email: comment.author_email,
              author_image_url: comment.author_image_url,
              is_deleted: comment.is_deleted,
              likes_count: comment.likes_count,
              replies_count: comment.replies_count,
              edited_at: comment.edited_at,
              user_has_liked: comment.user_has_liked || false,
              replies_has_more: comment.replies?.has_more || false,
              replies_total_count: comment.replies?.total_count || 0,
            });

            // Add replies if any
            if (comment.replies?.items && Array.isArray(comment.replies.items)) {
              comment.replies.items.forEach((reply: Comment & { user_has_liked?: boolean }) => {
                commentActivities.push({
                  id: reply.id,
                  type: "comment" as const,
                  content: reply.content,
                  created_at: reply.created_at,
                  author_name: reply.author_name,
                  author_email: reply.author_email,
                  author_image_url: reply.author_image_url,
                  is_deleted: reply.is_deleted,
                  likes_count: reply.likes_count,
                  replies_count: reply.replies_count,
                  edited_at: reply.edited_at,
                  user_has_liked: reply.user_has_liked || false,
                  parent_comment_id: reply.parent_id || comment.id, // Use reply.parent_id or fallback to comment.id
                });
              });
            }
          }
        );

        if (isLoadMore) {
          setActivities((prev) => {
            // Prevent duplicates by filtering out items that already exist
            const existingIds = new Set(prev.map((item) => item.id));
            const uniqueNewItems = commentActivities.filter((item: Activity) => !existingIds.has(item.id));
            return [...prev, ...uniqueNewItems];
          });
          setCurrentPage(pageNum);
        } else {
          setActivities(commentActivities);
          setCurrentPage(1);
        }

        setHasMore(!!data.hasMore);
        setError(null); // Clear any previous errors on success

        return commentActivities;
      } catch (error) {
        // Only log/handle error if this is still the current request
        if (requestId === requestIdRef.current) {
          const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
          setError(errorMessage);
          console.error("Error fetching page:", error);
          throw error;
        }
      }
    },
    [featureId, email, name, sortBy]
  );

  // Initialize with provided comments or fetch if needed
  useEffect(() => {
    if (initialComments && initialCommentsMetadata && sortBy === "newest") {
      // Use provided initial comments with replies (newest sort only, as that's what the backend provides)
      const commentActivities: Activity[] = [];

      initialComments.forEach(
        (comment: Comment & { user_has_liked?: boolean; replies?: { items: any[]; has_more: boolean; total_count: number } }) => {
          // Add main comment
          commentActivities.push({
            id: comment.id,
            type: "comment" as const,
            content: comment.content,
            created_at: comment.created_at,
            author_name: comment.author_name,
            author_email: comment.author_email,
            author_image_url: comment.author_image_url,
            is_deleted: comment.is_deleted,
            likes_count: comment.likes_count,
            replies_count: comment.replies_count,
            edited_at: comment.edited_at,
            user_has_liked: comment.user_has_liked || false,
            replies_has_more: comment.replies?.has_more || false,
            replies_total_count: comment.replies?.total_count || 0,
          });

          // Add replies if any
          if (comment.replies?.items && Array.isArray(comment.replies.items)) {
            comment.replies.items.forEach((reply: Comment & { user_has_liked?: boolean }) => {
              commentActivities.push({
                id: reply.id,
                type: "comment" as const,
                content: reply.content,
                created_at: reply.created_at,
                author_name: reply.author_name,
                author_email: reply.author_email,
                author_image_url: reply.author_image_url,
                is_deleted: reply.is_deleted,
                likes_count: reply.likes_count,
                replies_count: reply.replies_count,
                edited_at: reply.edited_at,
                user_has_liked: reply.user_has_liked || false,
                parent_comment_id: reply.parent_id || comment.id, // Use reply.parent_id or fallback to comment.id
              });
            });
          }
        }
      );

      setActivities(commentActivities);
      setCurrentPage(commentActivities.length > 0 ? 1 : 0);
      setHasMore(initialCommentsMetadata.hasMore);
      setIsLoading(false);
      setError(null);
    } else {
      // Need to fetch from API (either no initial comments provided, or different sort order)
      const loadActivities = async () => {
        setIsLoading(true);
        try {
          await fetchPage(1, false);
        } catch (error) {
          console.error("Error loading initial data:", error);
        } finally {
          setIsLoading(false);
        }
      };

      loadActivities();
    }
  }, [initialComments, initialCommentsMetadata, sortBy, fetchPage]);

  // Listen for comment added events to refresh the feed
  useEffect(() => {
    let isInitialLoad = true;

    const handleRefresh = async () => {
      // Skip refresh on initial load to avoid duplicate API request
      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }

      setIsLoading(true);
      try {
        await fetchPage(1, false);
      } catch (error) {
        console.error("Error refreshing activity feed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    window.addEventListener("refreshActivityFeed", handleRefresh);
    return () => window.removeEventListener("refreshActivityFeed", handleRefresh);
  }, [fetchPage]);

  // Intersection observer for infinite scroll - stable implementation
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Cleanup function for observer
  const cleanupObserver = () => {
    if (observerRef.current) {
      try {
        observerRef.current.disconnect();
      } catch (error) {
        console.warn("Error disconnecting observer:", error);
      } finally {
        observerRef.current = null;
      }
    }
  };

  useEffect(() => {
    // Clean up previous observer
    cleanupObserver();

    const el = sentinelRef.current;
    if (!el) return;

    const handleIntersection = async (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !isLoadingMore && !isLoading) {
        setIsLoadingMore(true);
        try {
          await fetchPage(currentPage + 1, true);
        } catch (error) {
          console.error("Error loading more:", error);
        } finally {
          setIsLoadingMore(false);
        }
      }
    };

    try {
      observerRef.current = new IntersectionObserver(handleIntersection, {
        rootMargin: "100px 0px 100px 0px", // Less aggressive prefetch
        threshold: 0,
      });

      observerRef.current.observe(el);
    } catch (error) {
      console.warn("Error creating IntersectionObserver:", error);
    }

    return cleanupObserver;
  }, [hasMore, isLoadingMore, isLoading, currentPage, fetchPage]); // Stable dependencies

  // Additional cleanup on component unmount
  useEffect(() => {
    return cleanupObserver;
  }, []);

  const getActivityColor = (type: string) => {
    switch (type) {
      case "comment":
        return "text-blue-600 bg-blue-50";
      case "status_change":
        return "text-green-600 bg-green-50";
      case "vote":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const getUserAvatar = (authorName: string, imageUrl?: string) => {
    if (imageUrl) {
      return <img src={imageUrl} alt={authorName} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />;
    }

    const initial = (authorName || "U").charAt(0).toUpperCase();
    const colors = ["bg-red-500", "bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-purple-500", "bg-pink-500", "bg-indigo-500", "bg-orange-500"];
    const colorIndex = authorName.length % colors.length;

    return (
      <div className={`w-8 h-8 ${colors[colorIndex]} rounded-full flex items-center justify-center flex-shrink-0`}>
        <span className="text-white text-sm font-semibold">{initial}</span>
      </div>
    );
  };

  const handleToggleLike = async (commentId: string) => {
    // Get current activity to revert if needed
    const currentActivity = activities.find((activity) => activity.id === commentId);
    if (!currentActivity) return;

    const originalLikesCount = currentActivity.likes_count || 0;
    const originalUserHasLiked = currentActivity.user_has_liked || false;

    // Optimistic update - immediately show expected result
    const newUserHasLiked = !originalUserHasLiked;
    const optimisticLikesCount = newUserHasLiked ? originalLikesCount + 1 : originalLikesCount - 1;

    setActivities((prev) =>
      prev.map((activity) =>
        activity.id === commentId ? { ...activity, likes_count: optimisticLikesCount, user_has_liked: newUserHasLiked } : activity
      )
    );

    try {
      const res = await fetch(`/api/features/${featureId}/comments/${commentId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      // Update with server response to ensure accuracy
      setActivities((prev) =>
        prev.map((activity) => (activity.id === commentId ? { ...activity, likes_count: data.likes_count, user_has_liked: data.liked } : activity))
      );
    } catch (error) {
      console.error("Error toggling like:", error);

      // Revert to original state on error
      setActivities((prev) =>
        prev.map((activity) =>
          activity.id === commentId ? { ...activity, likes_count: originalLikesCount, user_has_liked: originalUserHasLiked } : activity
        )
      );
    }
  };

  // Retry function for error handling
  const retryFetch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await fetchPage(1, false);
    } catch (error) {
      // Error is already handled in fetchPage
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-base md:text-lg lg:text-lg font-semibold">Activity Feed</h3>
            <div className="w-20 h-6 bg-gray-200 rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-start gap-3 animate-pulse">
              <div className="w-8 h-8 bg-gray-200 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="w-3/4 h-4 bg-gray-200 rounded" />
                <div className="w-1/2 h-3 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-xs">
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={retryFetch} className="ml-4">
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Don't render the component if there are no activities
  if (activities.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-base md:text-lg lg:text-lg font-semibold">Activity Feed</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-gray-500">Sort by</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 text-xs justify-between px-3">
                    <div className="flex items-center gap-2">
                      {React.createElement(sortConfig[sortBy].icon, {
                        className: "w-3 h-3 text-muted-foreground",
                      })}
                      <span className="text-foreground">{sortConfig[sortBy].label}</span>
                    </div>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-full min-w-[140px]">
                  {Object.entries(sortConfig).map(([sortKey, sortInfo]) => (
                    <DropdownMenuItem
                      key={sortKey}
                      onClick={() => setSortBy(sortKey as "newest" | "oldest")}
                      className={sortBy === sortKey ? "bg-accent" : ""}
                    >
                      <div className="flex items-center gap-2 w-full">
                        {React.createElement(sortInfo.icon, {
                          className: "w-4 h-4",
                        })}
                        <span>{sortInfo.label}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {activities
            .filter((activity) => !activity.parent_comment_id) // Only render main comments first
            .map((mainComment, mainIndex) => {
              // Get all replies for this main comment
              const replies = activities.filter((activity) => activity.parent_comment_id === mainComment.id);
              const isLastMainComment = mainIndex === activities.filter((a) => !a.parent_comment_id).length - 1;

              return (
                <div key={mainComment.id} className={`pb-4 ${!isLastMainComment ? "border-b border-gray-100" : ""}`}>
                  {/* Main Comment */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">{getUserAvatar(mainComment.author_name, mainComment.author_image_url)}</div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900 text-sm capitalize">{mainComment.author_name}</span>
                            {mainComment.type === "status_change" && (
                              <div className="text-xs text-gray-500">
                                marked this post as{" "}
                                <Badge variant="secondary" className="text-xs">
                                  {STATUS_TEXT[mainComment.new_status || ""] || "Unknown"}
                                </Badge>
                              </div>
                            )}
                            {mainComment.type === "vote" && <span className="text-xs text-gray-500">upvoted this</span>}
                          </div>

                          {mainComment.is_deleted ? (
                            <div className="text-sm text-gray-500 italic mt-1">This comment has been deleted</div>
                          ) : (
                            mainComment.content && <div className="text-sm text-gray-700 mt-1 leading-relaxed">{mainComment.content}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="w-6 h-6 p-0">
                            <MoreHorizontal className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        {mainComment.type === "comment" && !mainComment.is_deleted && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-gray-500 h-6 !px-0 hover:bg-transparent hover:text-primary"
                              onClick={() => handleToggleLike(mainComment.id)}
                            >
                              {mainComment.user_has_liked ? (
                                <HeartFillIcon className="w-2.5 h-2.5 mr-1 text-primary" />
                              ) : (
                                <HeartIcon className="w-2.5 h-2.5 mr-1" />
                              )}
                              <span className={(mainComment.likes_count || 0) > 0 ? "inline-block animate-[slideInRight_0.3s_ease-out]" : ""}>
                                {(mainComment.likes_count || 0) > 0 &&
                                  ((mainComment.likes_count || 0) === 1 ? "1 like" : `${mainComment.likes_count || 0} likes`)}
                              </span>
                            </Button>
                            <span className="text-xs text-gray-400">•</span>
                          </>
                        )}
                        <span className="text-xs text-gray-500">{formatTimeAgo(mainComment.created_at)}</span>
                        {mainComment.type === "comment" && !mainComment.is_deleted && (
                          <>
                            <span className="text-xs text-gray-400">•</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-gray-500 h-6 px-2"
                              onClick={() => setReplyingTo(mainComment.id === replyingTo ? null : mainComment.id)}
                            >
                              {replyingTo === mainComment.id ? "Cancel" : "Reply"}
                            </Button>
                          </>
                        )}

                        {mainComment.edited_at && (
                          <>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-400">edited</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Reply form for this comment */}
                  {replyingTo === mainComment.id && (
                    <div className="mt-3 ml-11">
                      <CommentForm
                        featureId={featureId}
                        email={email}
                        name={name}
                        parentCommentId={mainComment.id}
                        placeholder={`Reply to ${mainComment.author_name}...`}
                        onCommentAdded={handleReplyAdded}
                        isFocused={true}
                        isReply={true}
                      />
                    </div>
                  )}

                  {/* Replies */}
                  {replies.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {replies.map((reply, replyIndex) => {
                        const isLastReply = replyIndex === replies.length - 1;

                        return (
                          <div key={reply.id} className="ml-11">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0">{getUserAvatar(reply.author_name, reply.author_image_url)}</div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-semibold text-gray-900 text-sm capitalize">{reply.author_name}</span>
                                      {reply.type === "status_change" && (
                                        <div className="text-xs text-gray-500">
                                          marked this post as{" "}
                                          <Badge variant="secondary" className="text-xs">
                                            {STATUS_TEXT[reply.new_status || ""] || "Unknown"}
                                          </Badge>
                                        </div>
                                      )}
                                      {reply.type === "vote" && <span className="text-xs text-gray-500">upvoted this</span>}
                                    </div>

                                    {reply.is_deleted ? (
                                      <div className="text-sm text-gray-500 italic mt-1">This comment has been deleted</div>
                                    ) : (
                                      reply.content && <div className="text-sm text-gray-700 mt-1 leading-relaxed">{reply.content}</div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <Button variant="ghost" size="sm" className="w-6 h-6 p-0">
                                      <MoreHorizontal className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 mt-3">
                                  {reply.type === "comment" && !reply.is_deleted && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs text-gray-500 h-6 !px-0 hover:bg-transparent hover:text-primary"
                                        onClick={() => handleToggleLike(reply.id)}
                                      >
                                        {reply.user_has_liked ? (
                                          <HeartFillIcon className="w-2.5 h-2.5 mr-1 text-primary" />
                                        ) : (
                                          <HeartIcon className="w-2.5 h-2.5 mr-1" />
                                        )}
                                        <span className={(reply.likes_count || 0) > 0 ? "inline-block animate-[slideInRight_0.3s_ease-out]" : ""}>
                                          {(reply.likes_count || 0) > 0 &&
                                            ((reply.likes_count || 0) === 1 ? "1 like" : `${reply.likes_count || 0} likes`)}
                                        </span>
                                      </Button>
                                      <span className="text-xs text-gray-400">•</span>
                                    </>
                                  )}
                                  <span className="text-xs text-gray-500">{formatTimeAgo(reply.created_at)}</span>
                                  {reply.edited_at && (
                                    <>
                                      <span className="text-xs text-gray-400">•</span>
                                      <span className="text-xs text-gray-400">edited</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* View more replies button for the last reply */}
                            {isLastReply && mainComment.replies_has_more && (
                              <div className="mt-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleLoadMoreReplies(mainComment.id)}
                                  disabled={loadingMoreReplies === mainComment.id}
                                  className="text-xs text-gray-500 hover:text-blue-600 h-6"
                                >
                                  {loadingMoreReplies === mainComment.id ? (
                                    <>
                                      <LoadingSpinner size="xs" className="mr-1" />
                                      Loading...
                                    </>
                                  ) : (
                                    (() => {
                                      const remainingReplies = mainComment.replies_total_count! - replies.length;
                                      return remainingReplies > 10
                                        ? "View 10 more replies"
                                        : `View ${remainingReplies} more ${remainingReplies === 1 ? "reply" : "replies"}`;
                                    })()
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} />

          {/* Enhanced loading states */}
        </CardContent>

        {/* End of main comments indicator - only show when no more main comments to load */}
      </Card>

      {/* Loading indicator outside the card for infinite scroll */}
      <LoadMoreIndicator isVisible={isLoadingMore} />
      <EndOfListIndicator
        show={!hasMore && !isLoadingMore && !isLoading && activities.filter((a) => !a.parent_comment_id).length > 0}
        count={activities.filter((a) => !a.parent_comment_id).length}
      />
    </>
  );
}
