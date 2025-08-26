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

export default function ActivityFeed({ featureId, email, name }: ActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Request tracking for race condition protection
  const requestIdRef = useRef(0);

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

        // Convert comments to activity format
        const commentActivities = (data.comments || []).map((comment: Comment & { user_has_liked?: boolean }) => ({
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
        }));

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

  const loadActivities = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchPage(1, false);
    } catch (error) {
      console.error("Error loading initial data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  // Listen for comment added events to refresh the feed
  useEffect(() => {
    const handleRefresh = async () => {
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

  const getUserAvatar = (authorName: string) => {
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

  return (
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
        {activities.length === 0 ? (
          <div className="text-center py-6 sm:py-8">
            <MessageSquare className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">No activity yet</p>
            <p className="text-gray-400 text-xs mt-1">Be the first to leave a comment!</p>
          </div>
        ) : (
          <>
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-b-0 last:pb-0">
                <div className="flex-shrink-0 ">{getUserAvatar(activity.author_name)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900 text-sm capitalize">{activity.author_name}</span>
                        {activity.type === "status_change" && (
                          <div className="text-xs text-gray-500">
                            marked this post as{" "}
                            <Badge variant="secondary" className="text-xs">
                              {STATUS_TEXT[activity.new_status || ""] || "Unknown"}
                            </Badge>
                          </div>
                        )}
                        {activity.type === "vote" && <span className="text-xs text-gray-500">upvoted this</span>}
                      </div>

                      {activity.is_deleted ? (
                        <div className="text-sm text-gray-500 italic mt-1">This comment has been deleted</div>
                      ) : (
                        activity.content && <div className="text-sm text-gray-700 mt-1 leading-relaxed">{activity.content}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="w-6 h-6 p-0">
                        <MoreHorizontal className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    {activity.type === "comment" && !activity.is_deleted && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-gray-500 h-6 !px-0 hover:bg-transparent hover:text-primary"
                          onClick={() => handleToggleLike(activity.id)}
                        >
                          {activity.user_has_liked ? (
                            <HeartFillIcon className="w-2.5 h-2.5 mr-1 text-primary" />
                          ) : (
                            <HeartIcon className="w-2.5 h-2.5 mr-1" />
                          )}
                          <span className={(activity.likes_count || 0) > 0 ? "inline-block animate-[slideInRight_0.3s_ease-out]" : ""}>
                            {(activity.likes_count || 0) > 0 && ((activity.likes_count || 0) === 1 ? "1 like" : `${activity.likes_count || 0} likes`)}
                          </span>
                        </Button>
                        <span className="text-xs text-gray-400">•</span>
                      </>
                    )}
                    <span className="text-xs text-gray-500">{formatTimeAgo(activity.created_at)}</span>
                    {activity.type === "comment" && !activity.is_deleted && (
                      <>
                        <span className="text-xs text-gray-400">•</span>
                        <Button variant="ghost" size="sm" className="text-xs text-gray-500 h-6 px-2">
                          Reply
                        </Button>
                      </>
                    )}
                    {activity.edited_at && (
                      <>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-400">edited</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} />

            {/* Enhanced loading states */}
            <LoadMoreIndicator isVisible={isLoadingMore} />
            <EndOfListIndicator show={!hasMore && !isLoadingMore} count={activities.length} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
