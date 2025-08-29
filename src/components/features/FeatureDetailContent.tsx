"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, ChevronUp, AlertCircle, MoreHorizontal, Edit, Trash2, Loader2, Star } from "lucide-react";
import type { Feature } from "@/types";
import StatusBadge from "./StatusBadge";
import { formatNumber } from "@/lib/utils/numbers";
import ActivityFeed from "@/components/features/ActivityFeed";
import CommentForm from "@/components/features/CommentForm";

interface FeatureDetailContentProps {
  featureId: string;
  email: string;
  name: string;
  appSlug: string;
  urlImage?: string;
  isAdmin?: boolean;
  adminTab?: string;
  from?: string;
}

export default function FeatureDetailContent({
  featureId,
  email,
  name,
  appSlug,
  urlImage,
  isAdmin = false,
  adminTab = "features",
  from,
}: FeatureDetailContentProps) {
  const router = useRouter();
  const [feature, setFeature] = useState<Feature | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVotePending, setIsVotePending] = useState(false);
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const [initialComments, setInitialComments] = useState<any[] | null>(null);
  const [commentsMetadata, setCommentsMetadata] = useState<{ total: number; hasMore: boolean } | null>(null);
  const [addCommentToFeed, setAddCommentToFeed] = useState<((comment: any) => void) | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(isAdmin); // Use prop as initial value
  const [currentAdminTab, setCurrentAdminTab] = useState(adminTab); // Track admin tab

  // Determine if user came from admin panel based on the 'from' parameter
  const cameFromAdmin = from === "admin";

  // Feature editing state
  const [isEditingFeature, setIsEditingFeature] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [isUpdatingFeature, setIsUpdatingFeature] = useState(false);
  const [isDeletingFeature, setIsDeletingFeature] = useState(false);
  const [featureDropdownOpen, setFeatureDropdownOpen] = useState(false);

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

  // Read admin_tab from URL parameters on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const adminTabParam = urlParams.get("admin_tab");
      if (adminTabParam) {
        setCurrentAdminTab(adminTabParam);
      }
    }
  }, []);

  // Load feature details with initial comments
  useEffect(() => {
    if (!email || !name || !featureId) return;

    const loadFeature = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const urlParams = new URLSearchParams({
          app_slug: appSlug,
          email: email,
          name: name,
          includeComments: "true",
        });
        if (urlImage) {
          urlParams.set("url_image", urlImage);
        }

        const res = await fetch(`/api/features/${featureId}?${urlParams.toString()}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Feature request not found");
          }
          throw new Error("Failed to load feature request");
        }

        const data = await res.json();
        setFeature(data);

        // Update admin status based on API response
        if (data.isAdmin !== undefined) {
          setIsAdminUser(data.isAdmin);
        }

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
    if (cameFromAdmin) {
      // Navigate back to admin panel with the remembered tab
      const adminParams = new URLSearchParams();
      adminParams.set("tab", currentAdminTab);
      router.push(`/admin?${adminParams.toString()}`);
    } else {
      // Navigate back to features list for regular users
      const currentParams = new URLSearchParams();
      currentParams.set("app_slug", appSlug); // Always include app_slug
      if (email) currentParams.set("email", email);
      if (name) currentParams.set("name", name);

      router.push(`/features?${currentParams.toString()}`);
    }
  };

  // Check if current user is the author of the feature
  const isFeatureAuthor = feature && feature.author_email === email;

  // Handle starting feature edit
  const handleStartEditFeature = () => {
    if (!feature) return;
    setEditedTitle(feature.title);
    setEditedDescription(feature.description);
    setIsEditingFeature(true);
    setFeatureDropdownOpen(false);
  };

  // Handle canceling feature edit
  const handleCancelEditFeature = () => {
    setIsEditingFeature(false);
    setEditedTitle("");
    setEditedDescription("");
  };

  // Handle saving feature edit
  const handleSaveEditFeature = async () => {
    if (!feature || !editedTitle.trim() || !editedDescription.trim()) return;

    setIsUpdatingFeature(true);
    try {
      const urlParams = new URLSearchParams({
        app_slug: appSlug,
      });

      let endpoint: string;
      let requestBody: any;

      if (isAdminUser) {
        // Admin users use the main feature endpoint with PATCH
        endpoint = `/api/features/${featureId}?${urlParams.toString()}`;
        requestBody = {
          title: editedTitle.trim(),
          description: editedDescription.trim(),
        };
      } else {
        // Regular users use the author-edit endpoint
        endpoint = `/api/features/${featureId}/author-edit`;
        requestBody = {
          email,
          name,
          title: editedTitle.trim(),
          description: editedDescription.trim(),
        };
      }

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to update feature" }));
        throw new Error(errorData.error || "Failed to update feature");
      }

      const data = await res.json();

      // Update the feature in state
      setFeature((prev) =>
        prev
          ? {
              ...prev,
              title: data.feature?.title || data.title,
              description: data.feature?.description || data.description,
            }
          : null
      );

      setIsEditingFeature(false);
      setEditedTitle("");
      setEditedDescription("");
    } catch (error) {
      console.error("Error updating feature:", error);
      // TODO: Add error handling UI (toast/alert)
    } finally {
      setIsUpdatingFeature(false);
    }
  };

  // Handle deleting feature
  const handleDeleteFeature = async () => {
    if (!feature) return;

    setIsDeletingFeature(true);
    try {
      let endpoint: string;
      let requestBody: any;

      if (isAdminUser) {
        // Admin users use the main feature endpoint with DELETE
        const urlParams = new URLSearchParams({
          app_slug: appSlug,
        });
        endpoint = `/api/features/${featureId}?${urlParams.toString()}`;
        requestBody = {};
      } else {
        // Regular users use the author-delete endpoint
        endpoint = `/api/features/${featureId}/author-delete`;
        requestBody = { email, name };
      }

      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to delete feature" }));
        throw new Error(errorData.error || "Failed to delete feature");
      }

      // Navigate back to features list after successful deletion
      handleBack();
    } catch (error) {
      console.error("Error deleting feature:", error);
      // TODO: Add error handling UI (toast/alert)
    } finally {
      setIsDeletingFeature(false);
    }
  };

  const getUserAvatar = (authorName: string, imageUrl?: string, authorRole?: string) => {
    if (imageUrl) {
      return (
        <div className="relative flex-shrink-0">
          <img src={imageUrl} alt={authorName} className="w-8 h-8 rounded-full object-cover" />
          {authorRole === "admin" && (
            <div className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1">
              <div className="w-4 h-4 sm:w-5 sm:h-5 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 sm:w-4 sm:h-4 bg-primary rounded-full flex items-center justify-center">
                  <Star className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white fill-current" />
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    const initial = (authorName || "U").charAt(0).toUpperCase();
    const colors = [
      "bg-red-500",
      "bg-red-600",
      "bg-blue-500",
      "bg-blue-600",
      "bg-green-500",
      "bg-green-600",
      "bg-yellow-500",
      "bg-yellow-600",
      "bg-purple-500",
      "bg-purple-600",
      "bg-pink-500",
      "bg-pink-600",
      "bg-indigo-500",
      "bg-indigo-600",
      "bg-orange-500",
      "bg-orange-600",
      "bg-teal-500",
      "bg-teal-600",
      "bg-cyan-500",
      "bg-cyan-600",
      "bg-lime-500",
      "bg-lime-600",
      "bg-emerald-500",
      "bg-emerald-600",
      "bg-rose-500",
      "bg-rose-600",
      "bg-violet-500",
      "bg-violet-600",
      "bg-fuchsia-500",
      "bg-fuchsia-600",
      "bg-amber-500",
      "bg-amber-600",
      "bg-sky-500",
      "bg-sky-600",
    ];
    const colorIndex = authorName.length % colors.length;

    return (
      <div className="relative flex-shrink-0">
        <div className={`w-8 h-8 ${colors[colorIndex]} rounded-full flex items-center justify-center`}>
          <span className="text-white text-sm font-semibold">{initial}</span>
        </div>
        {authorRole === "admin" && (
          <div className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1">
            <div className="w-4 h-4 sm:w-5 sm:h-5 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center">
              <div className="w-3 h-3 sm:w-4 sm:h-4 bg-primary rounded-full flex items-center justify-center">
                <Star className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white fill-current" />
              </div>
            </div>
          </div>
        )}
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
            <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="w-32 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>

          {/* Content skeleton */}
          <Card className="shadow-xs dark:shadow-gray-800">
            <CardContent className="p-6 space-y-4">
              <div className="w-3/4 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="flex items-center gap-3">
                <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="w-2/3 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
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
            <span className="text-sm font-medium text-gray-500">{cameFromAdmin ? "BACK TO ADMIN PANEL" : "BACK TO ALL POSTS"}</span>
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
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f0f0f]">
      {/* Mobile Header */}
      <div className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handleBack}
              className="flex items-center bg-[#f0f0f0] dark:bg-gray-800/60 gap-2 text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100 p-0"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {cameFromAdmin ? "BACK TO ADMIN PANEL" : "BACK TO ALL POSTS"}
              </span>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-3xl px-4 py-4">
        {/* Feature Header */}
        <Card className="mb-4 shadow-xs dark:shadow-gray-800">
          <CardContent className="px-6 py-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {/* Vote count and title */}
                <div className="flex items-start gap-4 mb-4">
                  {/* Only show voting for non-admin users */}

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
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        {isEditingFeature ? (
                          <Input
                            value={editedTitle}
                            onChange={(e) => setEditedTitle(e.target.value)}
                            className="text-lg font-semibold mb-2"
                            placeholder="Feature title..."
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                handleSaveEditFeature();
                              } else if (e.key === "Escape") {
                                handleCancelEditFeature();
                              }
                            }}
                          />
                        ) : (
                          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">{feature.title}</h1>
                        )}
                      </div>

                      {/* Show edit/delete options for feature author OR admin */}
                      {(isFeatureAuthor || isAdminUser) && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isUpdatingFeature || isDeletingFeature ? (
                            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                          ) : (
                            <DropdownMenu open={featureDropdownOpen} onOpenChange={setFeatureDropdownOpen}>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-6 h-6 p-0">
                                  <MoreHorizontal className="w-3 h-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={handleStartEditFeature} className="flex items-center gap-2">
                                  <Edit className="w-4 h-4" />
                                  <span>Edit</span>
                                </DropdownMenuItem>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      onSelect={(e) => e.preventDefault()}
                                      className="flex items-center gap-2 text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="w-4 h-4 text-red-600 hover:text-red-700" />
                                      <span className="text-red-600 hover:text-red-700">Delete</span>
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Feature Request</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete this feature request? This action cannot be undone and will also delete all
                                        associated comments.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={handleDeleteFeature} className="bg-red-600 hover:bg-red-700 text-white">
                                        {isDeletingFeature ? (
                                          <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Deleting...
                                          </>
                                        ) : (
                                          "Delete"
                                        )}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      )}
                    </div>
                    <StatusBadge status={feature.status} />
                  </div>
                </div>

                {/* Author info */}
                <div className="flex items-center gap-3 mb-4">
                  {getUserAvatar(feature.author_name || "Unknown User", feature.author_image_url, feature.author_role)}
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{feature.author_name || "Unknown User"}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
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
                  {isEditingFeature ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        className="min-h-[100px] leading-relaxed whitespace-pre-wrap"
                        placeholder="Feature description..."
                      />
                      <div className="flex items-center gap-2">
                        <Button size="lg" onClick={handleSaveEditFeature} disabled={isUpdatingFeature} className="h-8 text-xs text-white">
                          {isUpdatingFeature ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleCancelEditFeature} disabled={isUpdatingFeature} className="h-8 text-xs">
                          Cancel
                        </Button>
                        <span className="hidden md:inline text-xs text-gray-400 ml-2">Ctrl+Enter to save, Esc to cancel</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{feature.description}</p>
                  )}
                </div>

                {/* Inline Comment Input - Hidden during feature editing and for admin users */}
                {!isEditingFeature && (
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
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
                      appSlug={appSlug}
                    />
                  </div>
                )}
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
            appSlug={appSlug}
            urlImage={urlImage}
            initialComments={initialComments}
            initialCommentsMetadata={commentsMetadata}
            onAddComment={(addCommentFn) => setAddCommentToFeed(() => addCommentFn)}
            isAdmin={isAdminUser}
          />
        )}
      </div>
    </div>
  );
}
