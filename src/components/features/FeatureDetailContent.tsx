"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, ChevronUp, AlertCircle } from "lucide-react";
import type { Feature } from "@/types";
import StatusBadge from "./StatusBadge";
import { formatNumber } from "@/lib/utils/numbers";
import ActivityFeed from "@/components/features/ActivityFeed";
import CommentForm from "@/components/features/CommentForm";

interface FeatureDetailContentProps {
  featureId: string;
  email: string;
  name: string;
}

export default function FeatureDetailContent({ featureId, email, name }: FeatureDetailContentProps) {
  const router = useRouter();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVotePending, setIsVotePending] = useState(false);
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const [initialComments, setInitialComments] = useState<any[] | null>(null);
  const [commentsMetadata, setCommentsMetadata] = useState<{ total: number; hasMore: boolean } | null>(null);
  const [addCommentToFeed, setAddCommentToFeed] = useState<((comment: any) => void) | null>(null);

  // Handle escape key to close comment form
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isCommentFocused) {
        setIsCommentFocused(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isCommentFocused]);

  // Load feature details with initial comments
  useEffect(() => {
    if (!email || !name || !featureId) return;

    const loadFeature = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/features/${featureId}?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&includeComments=true`,
          {
            cache: "no-store",
          }
        );

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Feature request not found");
          }
          throw new Error("Failed to load feature request");
        }

        const data = await res.json();
        setFeature(data);

        // Store initial comments data to pass directly to ActivityFeed
        if (data.comments) {
          setInitialComments(data.comments);
          setCommentsMetadata({
            total: data.commentsTotal,
            hasMore: data.commentsHasMore,
          });
        } else {
          // No initial comments were loaded
          setInitialComments([]);
          setCommentsMetadata({ total: 0, hasMore: false });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    loadFeature();
  }, [featureId, email, name]);

  const handleVoteToggle = async () => {
    if (!feature || isVotePending) return;

    setIsVotePending(true);

    // Optimistic update
    const originalVoted = feature.votedByMe;
    const originalCount = feature.votes_count;
    const newVoted = !originalVoted;
    const newCount = newVoted ? originalCount + 1 : Math.max(0, originalCount - 1);

    setFeature((prev) =>
      prev
        ? {
            ...prev,
            votedByMe: newVoted,
            votes_count: newCount,
          }
        : null
    );

    try {
      const res = await fetch(`/api/features/${featureId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });

      if (res.ok) {
        const data = await res.json();
        setFeature((prev) =>
          prev
            ? {
                ...prev,
                votedByMe: data.voted,
                votes_count: data.votes_count,
              }
            : null
        );
      } else {
        // Revert on error
        setFeature((prev) =>
          prev
            ? {
                ...prev,
                votedByMe: originalVoted,
                votes_count: originalCount,
              }
            : null
        );
      }
    } catch {
      // Revert on error
      setFeature((prev) =>
        prev
          ? {
              ...prev,
              votedByMe: originalVoted,
              votes_count: originalCount,
            }
          : null
      );
    } finally {
      setIsVotePending(false);
    }
  };

  const handleBack = () => {
    const currentParams = new URLSearchParams();
    if (email) currentParams.set("email", email);
    if (name) currentParams.set("name", name);

    router.push(`/features?${currentParams.toString()}`);
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

  if (!email || !name) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Email and name are required. Please navigate from the main features page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-gray-200 rounded animate-pulse" />
            <div className="w-32 h-6 bg-gray-200 rounded animate-pulse" />
          </div>

          {/* Content skeleton */}
          <Card className="shadow-xs">
            <CardContent className="p-6 space-y-4">
              <div className="w-3/4 h-8 bg-gray-200 rounded animate-pulse" />
              <div className="flex items-center gap-3">
                <div className="w-16 h-6 bg-gray-200 rounded animate-pulse" />
                <div className="w-12 h-12 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="w-full h-4 bg-gray-200 rounded animate-pulse" />
                <div className="w-2/3 h-4 bg-gray-200 rounded animate-pulse" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-6">
          <Button variant="ghost" onClick={handleBack} className="flex items-center bg-[#f0f0f0] gap-2 text-gray-800 hover:text-gray-900 p-0">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium text-gray-500">BACK TO ALL POSTS</span>
          </Button>

          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!feature) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Feature request not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={handleBack} className="flex items-center bg-[#f0f0f0] gap-2 text-gray-800 hover:text-gray-900 p-0">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium text-gray-500">BACK TO ALL POSTS</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-3xl px-4 py-4">
        {/* Feature Header */}
        <Card className="mb-4 shadow-xs">
          <CardContent className="px-6 py-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {/* Vote count and title */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex flex-col items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-13 w-10 flex flex-col items-center shadow-none font-normal justify-center rounded-md px-2 ${
                        feature.votedByMe ? "border-primary bg-primary/5 text-primary" : ""
                      }`}
                      onClick={handleVoteToggle}
                      disabled={isVotePending}
                    >
                      <div className="flex flex-col items-center">
                        {isVotePending ? (
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 lg:w-4 lg:h-4" />
                        )}
                        <span className="text-xs sm:text-sm font-normal">{formatNumber(feature.votes_count)}</span>
                      </div>
                    </Button>
                  </div>

                  <div className="flex-1">
                    <h1 className="text-lg font-semibold text-gray-900 leading-tight mb-2">{feature.title}</h1>
                    <StatusBadge status={feature.status} />
                  </div>
                </div>

                {/* Author info */}
                <div className="flex items-center gap-3 mb-4">
                  {getUserAvatar(feature.author_name || feature.name || "Unknown User", feature.author_image_url)}
                  <div>
                    <div className="text-sm font-semibold text-gray-900 capitalize">{feature.author_name || feature.name || "Unknown User"}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(feature.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="prose prose-sm max-w-none mb-4">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{feature.description}</p>
                </div>

                {/* Inline Comment Input */}
                <div className="border-t border-gray-100 pt-4">
                  <CommentForm
                    featureId={featureId}
                    email={email}
                    name={name}
                    onCommentAdded={(newComment) => {
                      // Add comment locally to the activity feed
                      if (addCommentToFeed) {
                        addCommentToFeed(newComment);
                      }
                    }}
                    placeholder="Leave a comment..."
                    onFocus={() => setIsCommentFocused(true)}
                    onBlur={() => {
                      // Delay to allow for button clicks
                      setTimeout(() => {
                        setIsCommentFocused(false);
                      }, 150);
                    }}
                    isFocused={isCommentFocused}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed - Only render when we know about initial comments */}
        {initialComments !== null && commentsMetadata !== null && (
          <ActivityFeed
            featureId={featureId}
            email={email}
            name={name}
            initialComments={initialComments}
            initialCommentsMetadata={commentsMetadata}
            onAddComment={(addCommentFn) => setAddCommentToFeed(() => addCommentFn)}
          />
        )}
      </div>
    </div>
  );
}
