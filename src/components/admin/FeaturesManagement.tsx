"use client";

import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  CircleAlert,
  Clock,
  Filter,
  Globe,
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
import { useRouter } from "next/navigation";
import { adminApi } from "@/services/adminApi";
import type { FeatureRequest, App } from "@/types/admin";
import useDebounce from "@/hooks/useDebounce";
import { formatCount } from "@/lib/utils/numbers";
import { getAppsCache, subscribeToCacheUpdates } from "./AppSelector";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { EmptyState } from "./EmptyState";
import { AppManagement, AppManagementRef } from "./AppManagement";
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
import { useAdminAuth } from "@/hooks/useAdminAuth";

// Types for better type safety
type SortOption = "new" | "trending" | "top";
type FilterOption = "all" | "open" | "under_review" | "planned" | "in_progress" | "done" | "mine";

interface FeaturesManagementProps {
  selectedApp: App | null;
  onAppSelect: (app: App | null) => void;
  activeTab?: string;
}

interface LoadingState {
  initial: boolean;
  more: boolean;
  search: boolean;
}

interface SearchState {
  query: string;
  filter: FilterOption;
  sort: SortOption;
}

// Utility function to highlight search terms in text
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function highlightSearchText(text: string, query: string, shouldHighlight: boolean = true): React.ReactNode {
  // Only highlight if explicitly enabled and there's a valid query
  if (!shouldHighlight || !query || !query.trim()) {
    return text;
  }

  const q = query.trim();
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

export function FeaturesManagement({ selectedApp, onAppSelect, activeTab = "features" }: FeaturesManagementProps) {
  const router = useRouter();
  const { currentAdmin } = useAdminAuth();
  const hiddenAppManagementRef = useRef<AppManagementRef>(null);

  // Core state
  const [features, setFeatures] = useState<FeatureRequest[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Smart caching for search results
  const [searchCache, setSearchCache] = useState<
    Record<
      string,
      {
        features: FeatureRequest[];
        page: number;
        hasMore: boolean;
        totalCount: number;
        timestamp: number;
      }
    >
  >({});
  const [currentSearchKey, setCurrentSearchKey] = useState<string>("default");

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("new");

  // Loading states
  const [loading, setLoading] = useState<LoadingState>({
    initial: true,
    more: false,
    search: false,
  });

  // Smart highlighting - only highlight after search results are loaded
  const [lastSearchTerm, setLastSearchTerm] = useState("");
  const [shouldHighlight, setShouldHighlight] = useState(false);

  // Request tracking for race condition protection
  const requestIdRef = useRef(0);

  // Other UI state
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [featureToDelete, setFeatureToDelete] = useState<{ id: string; title: string } | null>(null);
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [hasNoApps, setHasNoApps] = useState(false);

  // Refs
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const searchStateRef = useRef<SearchState>({
    query: "",
    filter: "all",
    sort: "new",
  });

  // Debounce search query - consistent with frontend
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Generate search key for caching
  const getSearchKey = useCallback((query: string, filter: FilterOption, sort: SortOption, appSlug?: string) => {
    return `${query || "empty"}|${filter}|${sort}|${appSlug || "all"}`;
  }, []);

  // Get cached results for a search key
  const getCachedResults = useCallback(
    (searchKey: string) => {
      const cached = searchCache[searchKey];
      if (!cached) return null;

      // Cache expires after 5 minutes
      const isExpired = Date.now() - cached.timestamp > 5 * 60 * 1000;
      return isExpired ? null : cached;
    },
    [searchCache]
  );

  // Load features with proper error handling and state management
  const loadFeatures = useCallback(
    async (pageNum: number = 1, mode: "replace" | "append" = "replace", useCache: boolean = true) => {
      if (loadingRef.current) {
        console.log("Load already in progress, skipping");
        return;
      }

      const requestId = ++requestIdRef.current;
      loadingRef.current = true;
      setError(null);

      const currentSearchTerm = debouncedSearchQuery.trim();

      // Disable highlighting while loading new search results
      if (mode === "replace" && currentSearchTerm !== lastSearchTerm) {
        setShouldHighlight(false);
      }

      // Generate current search key
      const searchKey = getSearchKey(debouncedSearchQuery, statusFilter, sortBy, selectedApp?.slug);

      // Update loading state
      setLoading((prev) => ({
        ...prev,
        initial: mode === "replace" && pageNum === 1 && features.length === 0,
        more: mode === "append",
        search: mode === "replace" && debouncedSearchQuery.trim().length > 0,
      }));

      try {
        // For append mode, check cache first
        if (mode === "append" && useCache) {
          const cached = getCachedResults(searchKey);
          if (cached && cached.page >= pageNum) {
            // We have cached results for this page or beyond
            const cachedFeatures = cached.features.slice(0, pageNum * 10);
            setFeatures(cachedFeatures);
            setPage(pageNum);
            setHasMore(cached.hasMore);
            setTotalCount(cached.totalCount);
            loadingRef.current = false;
            setLoading({ initial: false, more: false, search: false });
            return;
          }
        }

        const response = await adminApi.getFeatures({
          q: debouncedSearchQuery.trim() || undefined,
          filter: statusFilter,
          sort: sortBy,
          limit: 10,
          page: pageNum,
          app_slug: selectedApp?.slug,
        });

        // Check if this request is still the latest
        if (requestId !== requestIdRef.current) {
          loadingRef.current = false;
          return; // Abort if superseded by newer request
        }

        const newFeatures = response.items || [];

        // Update features
        if (mode === "replace") {
          setFeatures(newFeatures);
        } else {
          setFeatures((prev) => {
            // Remove duplicates when appending
            const existingIds = new Set(prev.map((f) => f.id));
            const uniqueNewFeatures = newFeatures.filter((f) => !existingIds.has(f.id));
            return [...prev, ...uniqueNewFeatures];
          });
        }

        // Update pagination state
        setPage(pageNum);
        setHasMore(response.hasMore || false);
        setTotalCount(response.total || 0);

        // Enable highlighting after successful search results are loaded
        if (mode === "replace" && currentSearchTerm) {
          setLastSearchTerm(currentSearchTerm);
          setShouldHighlight(true);
        } else if (mode === "replace" && !currentSearchTerm) {
          // No search term, so no highlighting needed
          setLastSearchTerm("");
          setShouldHighlight(false);
        }

        // Cache the results
        if (mode === "replace") {
          setSearchCache((prev) => ({
            ...prev,
            [searchKey]: {
              features: newFeatures,
              page: pageNum,
              hasMore: response.hasMore || false,
              totalCount: response.total || 0,
              timestamp: Date.now(),
            },
          }));
        }
      } catch (error: any) {
        // Only handle error if this is still the current request
        if (requestId === requestIdRef.current) {
          console.error("Error loading features:", error);
          setError(error.message || "Failed to load features. Please try again.");
        }
      } finally {
        // Only update loading state if this is still the current request
        if (requestId === requestIdRef.current) {
          loadingRef.current = false;
          setLoading({
            initial: false,
            more: false,
            search: false,
          });
        }
      }
    },
    [debouncedSearchQuery, statusFilter, sortBy, selectedApp, features.length, getSearchKey, getCachedResults]
  );

  // Helper function to determine if there are no apps
  const checkAppsState = () => {
    const appsCache = getAppsCache();

    if (selectedApp) {
      // Clear cache when app changes to avoid stale data
      setSearchCache({});
      setPage(1);
      setHasMore(false);
      setFeatures([]);
      setTotalCount(0);

      const initialSearchKey = getSearchKey("", "all", "new", selectedApp.slug);
      setCurrentSearchKey(initialSearchKey);
      setShowEmptyState(false);
      setHasNoApps(false);
      loadFeatures(1, "replace");
      return;
    }

    // Reset state when no app is selected
    setFeatures([]);
    setTotalCount(0);
    setPage(1);
    setHasMore(false);
    setLoading((prev) => ({ ...prev, initial: false, more: false, search: false }));

    if (appsCache === null) {
      // Cache is still loading, don't show any empty state yet
      setShowEmptyState(false);
      setHasNoApps(false);
    } else if (appsCache.apps.length === 0) {
      // No apps exist at all - show getting started UI
      setHasNoApps(true);
      setShowEmptyState(false);
    } else {
      // Apps exist but none selected - show regular empty state
      setHasNoApps(false);

      // Delay showing empty state to prevent flash during initial load
      const timer = setTimeout(() => {
        setShowEmptyState(true);
      }, 500);

      return () => clearTimeout(timer);
    }
  };

  // Initial load
  useEffect(() => {
    // Check apps state initially
    checkAppsState();

    // Subscribe to cache updates
    const unsubscribe = subscribeToCacheUpdates(() => {
      checkAppsState();
    });

    return unsubscribe;
  }, [selectedApp?.slug]); // Only depend on slug, not entire object

  // Clean up expired cache entries
  useEffect(() => {
    const cleanup = () => {
      setSearchCache((prev) => {
        const now = Date.now();
        const cleaned = { ...prev };

        Object.keys(cleaned).forEach((key) => {
          if (now - cleaned[key].timestamp > 10 * 60 * 1000) {
            // 10 minutes
            delete cleaned[key];
          }
        });

        return cleaned;
      });
    };

    const interval = setInterval(cleanup, 5 * 60 * 1000); // Clean every 5 minutes
    return () => clearInterval(interval);
  }, []);

  // Handle search/filter/sort changes with smart caching
  useEffect(() => {
    // Only handle search changes when we have a selected app
    if (!selectedApp) return;

    const currentSearchState: SearchState = {
      query: debouncedSearchQuery,
      filter: statusFilter,
      sort: sortBy,
    };

    // Check if search parameters actually changed
    const prevSearchState = searchStateRef.current;
    const hasSearchChanged =
      prevSearchState.query !== currentSearchState.query ||
      prevSearchState.filter !== currentSearchState.filter ||
      prevSearchState.sort !== currentSearchState.sort;

    if (hasSearchChanged) {
      // Generate new search key
      const newSearchKey = getSearchKey(debouncedSearchQuery, statusFilter, sortBy, selectedApp.slug);
      setCurrentSearchKey(newSearchKey);

      // Check if we have cached results for this search
      const cachedResults = getCachedResults(newSearchKey);

      if (cachedResults) {
        // Show cached results immediately
        setFeatures(cachedResults.features);
        setPage(cachedResults.page);
        setHasMore(cachedResults.hasMore);
        setTotalCount(cachedResults.totalCount);
        setError(null);

        // Then fetch fresh data in the background
        loadFeatures(1, "replace", false);
      } else {
        // No cache available, reset and show loading
        setPage(1);
        setHasMore(false);
        setFeatures([]);
        setTotalCount(0);
        loadFeatures(1, "replace");
      }

      searchStateRef.current = currentSearchState;
    }
  }, [debouncedSearchQuery, statusFilter, sortBy, selectedApp?.slug, loadFeatures, getSearchKey, getCachedResults]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loading.more && !loadingRef.current) {
          loadFeatures(page + 1, "append");
        }
      },
      { rootMargin: "200px 0px 200px 0px", threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading.more, page, loadFeatures]);

  const handleStatusUpdate = async (featureId: string, newStatus: string) => {
    // Find the current feature to check its current status
    const currentFeature = features.find((f) => f.id === featureId);

    // If the status hasn't changed, don't make the API call
    if (currentFeature && currentFeature.status === newStatus) {
      return; // No change needed, exit early
    }

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
        // Update total count
        setTotalCount((prev) => Math.max(0, prev - 1));
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

  const handleFeatureClick = (featureId: string) => {
    if (!currentAdmin || !selectedApp) return;

    // Navigate to feature detail page with admin context and current tab
    const params = new URLSearchParams({
      email: currentAdmin.email,
      name: currentAdmin.name,
      app_slug: selectedApp.slug,
      admin_tab: activeTab,
      from: "admin",
    });

    router.push(`/features/${featureId}?${params.toString()}`);
  };

  // Load more indicator component
  const LoadMoreIndicator = ({ isVisible }: { isVisible: boolean }) => {
    if (!isVisible) return null;

    return (
      <div className="flex items-center justify-center py-6">
        <div className="flex items-center space-x-3 px-4 py-2 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">Loading more features...</span>
        </div>
      </div>
    );
  };

  // End of list indicator component
  const EndOfListIndicator = ({ show, count }: { show: boolean; count: number }) => {
    if (!show || count === 0 || count <= 10) return null;

    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-100 to-blue-100 dark:from-green-800 dark:to-blue-800 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600 dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">You're all caught up!</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">You've seen all {count} feature requests</div>
        </div>
      </div>
    );
  };

  // Client-side filtering for search terms (API already handles server-side filtering)
  const filteredFeatures = features.filter((feature) => {
    // Additional client-side filtering if needed
    // Most filtering is done server-side, but we can add client-side search highlighting
    return true;
  });

  // Smart highlighting - only show when results are loaded and we have a search term
  const shouldHighlightSearch = shouldHighlight && lastSearchTerm.length > 0;

  // Show loading until we have a selected app
  if (!selectedApp) {
    return (
      <>
        <div className="space-y-6">
          {/* App Selector - Hide when empty state is showing */}
          {!(hasNoApps || showEmptyState) && (
            <div className="bg-card rounded-2xl p-4 md:p-6 border border-border shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-1">Application Management</h2>
                  <p className="text-sm text-muted-foreground">Select an application to manage its features and data</p>
                </div>
                <AppManagement selectedApp={null} onAppSelect={onAppSelect} className="w-full sm:w-auto" />
              </div>
            </div>
          )}

          {/* Hidden AppManagement for empty state modal */}
          {(hasNoApps || showEmptyState) && (
            <div style={{ display: "none" }}>
              <AppManagement ref={hiddenAppManagementRef} selectedApp={null} onAppSelect={onAppSelect} />
            </div>
          )}

          {/* Empty State */}
          {hasNoApps || showEmptyState ? (
            <EmptyState
              type={hasNoApps ? "no-apps" : "no-selection"}
              context="features"
              onCreateApp={() => hiddenAppManagementRef.current?.openCreateModal()}
            />
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* App Selector */}
        <div className="bg-card rounded-2xl p-4 md:p-6 border border-border shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Application Management</h2>
              <p className="text-sm text-muted-foreground">Select an application to manage its features and data</p>
            </div>
            <AppManagement selectedApp={selectedApp} onAppSelect={onAppSelect} className="w-full sm:w-auto" />
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-card rounded-2xl p-6 border border-border shadow-xs">
          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search features..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-20 h-11 bg-background" // Increased right padding for buttons
              />

              {/* Right side - Loading + Clear button */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {/* Loading indicator */}
                {loading.search && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent flex-shrink-0" />
                )}

                {/* Clear button - only show if there's text */}
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                    title="Clear search"
                    type="button"
                  >
                    <svg className="w-4 h-4 text-muted-foreground hover:text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
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
                      <DropdownMenuItem key={statusKey} onClick={() => setStatusFilter(statusKey as FilterOption)}>
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
          {loading.initial && features.length === 0 ? (
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
                // Ensure feature has a unique ID for React key
                if (!feature.id) {
                  console.error("Feature missing ID:", feature);
                  return null;
                }
                return (
                  <div
                    key={`feature-${feature.id}`}
                    className="bg-card rounded-2xl p-4 sm:p-6 border border-border shadow-xs hover:shadow-md hover:border-primary/20 transition-all cursor-pointer"
                    onClick={() => handleFeatureClick(feature.id)}
                    title="Click to view feature details"
                  >
                    {/* Mobile: Column layout, Desktop: Row layout */}
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 lg:gap-6">
                      {/* Feature Content */}
                      <div className="flex-1 min-w-0">
                        <div className="mb-3">
                          <h3 className="text-base md:text-base lg:text-base font-semibold text-foreground break-word line-clamp-2 overflow-hidden">
                            {highlightSearchText(feature.title, lastSearchTerm, shouldHighlightSearch)}
                          </h3>
                        </div>

                        <p className="text-muted-foreground mb-4 text-xs sm:text-base md:text-base lg:text-sm leading-relaxed line-clamp-3 overflow-hidden">
                          {highlightSearchText(feature.description, lastSearchTerm, shouldHighlightSearch)}
                        </p>

                        {/* Metadata - Responsive flex layout */}
                        <div className="flex flex-wrap gap-2 sm:gap-4 lg:gap-6 text-sm lg:text-base text-muted-foreground">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="truncate block">
                                {highlightSearchText(feature.author_name, lastSearchTerm, shouldHighlightSearch)}
                              </span>
                              <span className="truncate block text-xs">{feature.author_email}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <ThumbsUp className="w-4 h-4" />
                            </div>
                            <span className="text-xs sm:text-sm">{formatCount(feature.votes_count, "vote")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <MessageSquare className="w-4 h-4" />
                            </div>
                            <span className="text-xs sm:text-sm">{formatCount(feature.comments_count, "comment")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <Clock className="w-4 h-4" />
                            </div>
                            <span className="text-xs sm:text-sm">{new Date(feature.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <Globe className="w-4 h-4" />
                            </div>
                            <span className="text-xs sm:text-sm">{feature.app_name}</span>
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
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFeature(feature.id, feature.title);
                            }}
                            disabled={isUpdating === feature.id}
                            className="w-full px-3 py-2 h-9 border-destructive/20 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 transition-colors"
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
                                onClick={(e) => e.stopPropagation()}
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusUpdate(feature.id, statusKey);
                                  }}
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
              <LoadMoreIndicator isVisible={loading.more} />
              <EndOfListIndicator show={!hasMore && !loading.more} count={features.length} />
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-white dark:bg-[#121212]">
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
