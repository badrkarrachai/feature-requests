"use client";

import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  CircleAlert,
  Clock,
  Filter,
  Layers,
  Loader,
  MessageSquare,
  Search,
  SortAsc,
  ThumbsUp,
  Trash2,
  User,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "@/services/adminApi";
import type { FeatureRequest } from "@/types/admin";
import useDebounce from "@/hooks/useDebounce";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// Utility function to highlight search terms in text
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function highlightSearchText(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;

  // Support multiple words: "table sort" -> /(table|sort)/gi
  const terms = Array.from(new Set(q.split(/\s+/)))
    .filter(Boolean)
    .map(escapeRegExp);
  if (terms.length === 0) return text;

  const re = new RegExp(`(${terms.join("|")})`, "gi");

  // After split with a capturing group, matches are at odd indexes.
  const parts = text.split(re);

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="
          bg-yellow-200/60 dark:bg-yellow-700/50
          text-inherit
          rounded-sm
          box-decoration-clone
          px-0.5 -mx-0.5
        "
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

const statusConfig = {
  all: {
    label: "All Status",
    color: "bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400",
    icon: Layers,
  },
  under_review: {
    label: "Under Review",
    color: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-600 ",
    icon: CircleAlert,
  },
  planned: {
    label: "Planned",
    color: "bg-blue-50 text-blue-700  dark:bg-blue-900/20 dark:text-blue-500",
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    color: "bg-purple-50 text-purple-700  dark:bg-purple-900/20 dark:text-purple-500 ",
    icon: Loader,
  },
  done: {
    label: "Complete",
    color: "bg-emerald-50 text-emerald-700  dark:bg-emerald-900/20 dark:text-emerald-500",
    icon: CheckCircle,
  },
};

const sortConfig = {
  new: {
    label: "Newest",
    icon: Clock,
  },
  trending: {
    label: "Trending",
    icon: ThumbsUp,
  },
  top: {
    label: "Top",
    icon: SortAsc,
  },
};

export function FeaturesManagement() {
  const [features, setFeatures] = useState<FeatureRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"trending" | "top" | "new">("new");
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [featureToDelete, setFeatureToDelete] = useState<{ id: string; title: string } | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Debounce search query to avoid excessive API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const loadFeatures = useCallback(
    async (pageNum: number = 1, mode: "replace" | "append" = "replace") => {
      try {
        // Only show search loading if there's an active search and replacing
        if (debouncedSearchQuery.trim().length > 0 && mode === "replace") {
          setIsSearching(true);
        } else if (mode === "replace") {
          setIsLoading(true);
        } else {
          setLoadingMore(true);
        }

        setError(null);

        const response = await adminApi.getFeatures({
          q: debouncedSearchQuery.trim() || undefined,
          filter: statusFilter as any,
          sort: sortBy,
          limit: 20,
          page: pageNum,
        });

        if (mode === "replace") {
          setFeatures(response.items || []);
        } else {
          setFeatures((prev) => [...prev, ...(response.items || [])]);
        }

        setHasMore(response.hasMore || false);
        setPage(pageNum);
      } catch (error: any) {
        console.error("Error loading features:", error);
        setError("Failed to load features. Please try again.");
      } finally {
        setIsLoading(false);
        setIsSearching(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearchQuery, statusFilter, sortBy]
  );

  // Load features with debounced search
  useEffect(() => {
    loadFeatures(1, "replace");
  }, [debouncedSearchQuery, statusFilter, sortBy]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loadingMore && !isLoading && !isSearching) {
          await loadFeatures(page + 1, "append");
        }
      },
      { rootMargin: "300px 0px 300px 0px", threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, isLoading, isSearching, page, loadFeatures]);

  const handleStatusUpdate = async (featureId: string, newStatus: string) => {
    try {
      setIsUpdating(featureId);
      const success = await adminApi.updateFeatureStatus(featureId, newStatus);
      if (success) {
        // Update local state
        setFeatures((prev) => prev.map((f) => (f.id === featureId ? { ...f, status: newStatus as any } : f)));
        toast.success("Feature status updated successfully!");
      } else {
        toast.error("Failed to update feature status");
      }
    } catch (error) {
      console.error("Error updating feature status:", error);
      toast.error("Failed to update feature status");
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteFeature = (featureId: string, title: string) => {
    setFeatureToDelete({ id: featureId, title });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!featureToDelete) return;

    try {
      const success = await adminApi.deleteFeature(featureToDelete.id);
      if (success) {
        setFeatures((prev) => prev.filter((f) => f.id !== featureToDelete.id));
        toast.success("Feature deleted successfully!");
      } else {
        toast.error("Failed to delete feature");
      }
    } catch (error) {
      console.error("Error deleting feature:", error);
      toast.error("Failed to delete feature");
    } finally {
      setDeleteDialogOpen(false);
      setFeatureToDelete(null);
    }
  };

  // Load more indicator component
  const LoadMoreIndicator = ({ isVisible }: { isVisible: boolean }) => {
    if (!isVisible) return null;

    return (
      <div className="flex items-center justify-center py-6">
        <div className="flex items-center space-x-3 px-4 py-2 rounded-full bg-gray-50 border border-gray-200">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <span className="text-sm text-gray-600 font-medium">Loading more features...</span>
        </div>
      </div>
    );
  };

  // End of list indicator component
  const EndOfListIndicator = ({ show, count }: { show: boolean; count: number }) => {
    if (!show || count === 0 || count <= 20) return null;

    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-100 to-blue-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="text-sm font-medium text-gray-700">You're all caught up!</div>
          <div className="text-xs text-gray-500">You've seen all {count} feature requests</div>
        </div>
      </div>
    );
  };

  const filteredFeatures = features.filter((feature) => {
    const matchesSearch =
      !searchQuery ||
      feature.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feature.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feature.author_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || feature.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <div className="space-y-6">
        {/* Search and Filters */}
        <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search features..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 h-11"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary opacity-70"></div>
                </div>
              )}
            </div>

            {/* Filter Section */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Filter by</span>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex-1 sm:flex-none sm:w-auto sm:min-w-[160px] justify-between px-4 py-3 h-auto">
                    <div className="flex items-center gap-2">
                      {React.createElement(statusConfig[statusFilter as keyof typeof statusConfig]?.icon || Layers, {
                        className: "w-4 h-4 text-muted-foreground",
                      })}
                      <span className="text-foreground">{statusConfig[statusFilter as keyof typeof statusConfig]?.label || "All Status"}</span>
                    </div>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-full min-w-[180px]">
                  <DropdownMenuItem onClick={() => setStatusFilter("all")}>
                    <div className="flex items-center gap-2 w-full">
                      {React.createElement(statusConfig.all.icon, {
                        className: "w-4 h-4",
                      })}
                      <span>{statusConfig.all.label}</span>
                    </div>
                  </DropdownMenuItem>
                  {Object.entries(statusConfig)
                    .filter(([key]) => key !== "all")
                    .map(([statusKey, statusInfo]) => (
                      <DropdownMenuItem key={statusKey} onClick={() => setStatusFilter(statusKey)}>
                        <div className="flex items-center gap-2 w-full">
                          {React.createElement(statusInfo.icon, {
                            className: "w-4 h-4",
                          })}
                          <span>{statusInfo.label}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex-1 sm:flex-none sm:w-auto sm:min-w-[140px] justify-between px-4 py-3 h-auto">
                    <div className="flex items-center gap-2">
                      {React.createElement(sortConfig[sortBy].icon, {
                        className: "w-4 h-4 text-muted-foreground",
                      })}
                      <span className="text-foreground">{sortConfig[sortBy].label}</span>
                    </div>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-full min-w-[160px]">
                  {Object.entries(sortConfig).map(([sortKey, sortInfo]) => (
                    <DropdownMenuItem key={sortKey} onClick={() => setSortBy(sortKey as "trending" | "top" | "new")}>
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
        </div>

        {/* Features List */}
        <div className="space-y-4">
          {/* Error State */}
          {error && (
            <div className="bg-destructive/10 rounded-2xl p-6 border border-destructive/20 text-center">
              <p className="text-destructive font-medium mb-2">Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          )}

          {/* Loading States */}
          {isLoading ? (
            <div className="bg-card rounded-2xl p-12 border border-border text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading features...</p>
            </div>
          ) : filteredFeatures.length === 0 ? (
            <div className="bg-card rounded-2xl p-12 border border-border text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {debouncedSearchQuery.trim() ? "No search results found" : "No features found"}
              </h3>
              <p className="text-muted-foreground">
                {debouncedSearchQuery.trim()
                  ? `No features match "${debouncedSearchQuery.trim()}". Try different keywords or clear your search.`
                  : statusFilter !== "all"
                  ? `No features found with the selected filter. Try changing the filter or clearing it.`
                  : "No feature requests have been submitted yet."}
              </p>
            </div>
          ) : (
            <>
              {filteredFeatures.map((feature) => {
                return (
                  <div key={feature.id} className="bg-card rounded-2xl p-4 sm:p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
                    {/* Mobile: Column layout, Desktop: Row layout */}
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 lg:gap-6">
                      {/* Feature Content */}
                      <div className="flex-1 min-w-0">
                        <div className="mb-3">
                          <h3 className="text-base md:text-base lg:text-base font-semibold text-foreground break-words">
                            {highlightSearchText(feature.title, searchQuery)}
                          </h3>
                        </div>

                        <p className="text-muted-foreground mb-4 text-xs sm:text-base md:text-base lg:text-sm leading-relaxed">
                          {highlightSearchText(feature.description, searchQuery)}
                        </p>

                        {/* Metadata - Responsive flex layout */}
                        <div className="flex flex-wrap gap-2 sm:gap-4 lg:gap-6 text-sm lg:text-base text-muted-foreground">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="truncate block">{highlightSearchText(feature.author_name, searchQuery)}</span>
                              <span className="truncate block text-xs">{feature.author_email}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <ThumbsUp className="w-4 h-4" />
                            </div>
                            <span className="text-xs sm:text-sm">{feature.votes_count} votes</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <MessageSquare className="w-4 h-4" />
                            </div>
                            <span className="text-xs sm:text-sm">{feature.comments_count} comments</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <Clock className="w-4 h-4" />
                            </div>
                            <span className="text-xs sm:text-sm">{new Date(feature.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions - Side by side on all screen sizes */}
                      <div className="flex flex-row gap-2 lg:gap-3 lg:min-w-[280px]">
                        {/* Delete Button - On the left, smaller width on mobile */}
                        <div className="w-auto min-w-[80px] sm:min-w-[100px]">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteFeature(feature.id, feature.title)}
                            disabled={isUpdating === feature.id}
                            className="w-full px-3 py-2 h-9 border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/30 transition-colors"
                            title="Delete feature"
                          >
                            <div className="flex items-center justify-center gap-1">
                              <Trash2 className="w-4 h-4" />
                              <span className="text-sm font-medium hidden sm:inline">Delete</span>
                            </div>
                          </Button>
                        </div>

                        {/* Status Dropdown - Takes remaining space on desktop */}
                        <div className="flex-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isUpdating === feature.id}
                                className={`w-full justify-between px-3 py-2 h-9 ${statusConfig[feature.status]?.color || ""}`}
                              >
                                <div className="flex items-center gap-2">
                                  {React.createElement(statusConfig[feature.status]?.icon || AlertCircle, {
                                    className: "w-4 h-4",
                                  })}
                                  <span className="text-sm font-medium">{statusConfig[feature.status]?.label || "Unknown"}</span>
                                </div>
                                <ChevronDown className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-full min-w-[180px]">
                              {Object.entries(statusConfig).map(([statusKey, statusInfo]) => (
                                <DropdownMenuItem
                                  key={statusKey}
                                  onClick={() => handleStatusUpdate(feature.id, statusKey)}
                                  disabled={isUpdating === feature.id}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    {React.createElement(statusInfo.icon, {
                                      className: "w-4 h-4",
                                    })}
                                    <span>{statusInfo.label}</span>
                                  </div>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Sentinel for infinite scroll */}
              <div ref={sentinelRef} />

              {/* Loading indicators */}
              <LoadMoreIndicator isVisible={loadingMore} />
              <EndOfListIndicator show={!hasMore && !loadingMore} count={features.length} />
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Feature Request</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete "{featureToDelete?.title}"? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
