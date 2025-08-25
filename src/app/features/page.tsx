"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import FeatureList from "@/components/features/FeatureList";
import NewFeatureModal from "@/components/features/NewFeatureModal";
import TopBar from "@/components/layout/TopBar";
import type { Feature, FeatureFilter, FeatureSort } from "@/types";

// ---- helpers to parse URL params safely
function parseFilter(v: string | null): FeatureFilter {
  const allowed: FeatureFilter[] = ["all", "under_review", "planned", "in_progress", "done", "mine"];
  return (allowed as string[]).includes(v ?? "") ? (v as FeatureFilter) : "all";
}
function parseSort(v: string | null): Exclude<FeatureSort, null> {
  const allowed: Exclude<FeatureSort, null>[] = ["trending", "top", "new"];
  return (allowed as string[]).includes(v ?? "") ? (v as Exclude<FeatureSort, null>) : "trending";
}

type ApiPage = {
  items: Feature[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

// Enhanced Loading Components
const FeatureCardSkeleton = () => (
  <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
    <div className="flex items-start space-x-3">
      <div className="flex flex-col items-center space-y-1">
        <div className="w-8 h-6 bg-gray-200 rounded"></div>
        <div className="w-4 h-4 bg-gray-200 rounded-full"></div>
      </div>
      <div className="flex-1 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        <div className="flex items-center space-x-2">
          <div className="h-2 bg-gray-200 rounded w-16"></div>
          <div className="h-2 bg-gray-200 rounded w-12"></div>
        </div>
      </div>
    </div>
  </div>
);

type SpinnerSize = "xs" | "sm" | "md" | "lg";

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

const LoadingSpinner = ({ size = "sm", className = "" }: LoadingSpinnerProps) => {
  const sizeClasses: Record<SpinnerSize, string> = {
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

const InitialLoader = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-center py-8">
      <div className="flex flex-col items-center space-y-3">
        <LoadingSpinner size="lg" className="text-blue-600" />
        <div className="text-sm text-gray-600 font-medium">Loading features...</div>
        <div className="text-xs text-gray-400">This won't take long</div>
      </div>
    </div>
    {/* Show skeleton cards */}
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <FeatureCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

interface LoadMoreIndicatorProps {
  isVisible: boolean;
}

const LoadMoreIndicator = ({ isVisible }: LoadMoreIndicatorProps) => {
  if (!isVisible) return null;

  return (
    <div className="flex items-center justify-center py-6">
      <div className="flex items-center space-x-3 px-4 py-2 rounded-full bg-gray-50 border border-gray-200">
        <LoadingSpinner size="sm" className="text-blue-600" />
        <span className="text-sm text-gray-600 font-medium">Loading more features...</span>
      </div>
    </div>
  );
};

interface EndOfListIndicatorProps {
  show: boolean;
  count: number;
}

const EndOfListIndicator = ({ show, count }: EndOfListIndicatorProps) => {
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
        <div className="text-xs text-gray-500">You've seen all {count} feature requests</div>
      </div>
    </div>
  );
};

interface ErrorDisplayProps {
  error: string | null;
  onRetry: () => void;
}

const ErrorDisplay = ({ error, onRetry }: ErrorDisplayProps) => {
  if (!error) return null;

  return (
    <div className="border-x border-b rounded-b-xl">
      <div className="flex flex-col items-center justify-center py-12 px-8">
        <div className="mb-4 p-3 rounded-full bg-red-50 border border-red-100">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.864-.833-2.634 0L4.168 15.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Something went wrong</h3>
        <p className="text-sm text-gray-600 text-center max-w-sm mb-4">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors duration-200"
        >
          Try again
        </button>
      </div>
    </div>
  );
};

interface EmptyStateProps {
  searchterm: string;
  onOpenNew: () => void;
}

// Wrapper component to handle search params with Suspense
function FeaturesPageContent() {
  const params = useSearchParams();
  const router = useRouter();

  const email = params.get("email") || "";
  const name = params.get("name") || "";

  // mutually-exclusive sort/filter from URL
  const initialFilter = parseFilter(params.get("filter"));
  const initialSort: FeatureSort = initialFilter !== "all" ? null : parseSort(params.get("sort"));

  // Core state
  const [items, setItems] = useState<Feature[]>([]);
  const [q, setQ] = useState(params.get("q") || "");
  const [sort, setSort] = useState<FeatureSort>(initialSort);
  const [filter, setFilter] = useState<FeatureFilter>(initialFilter);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Request tracking for race condition protection
  const requestIdRef = useRef(0);

  // Loading states
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  // Smart highlighting - only highlight after search results are loaded
  const [lastSearchTerm, setLastSearchTerm] = useState("");
  const [shouldHighlight, setShouldHighlight] = useState(false);

  // Error handling
  const [fetchError, setFetchError] = useState<string | null>(null);

  // No need for additional debouncing - TopBar already handles it

  const [open, setOpen] = useState(false);

  // Store original states for vote reverts
  const [originalVoteStates, setOriginalVoteStates] = useState<Record<string, { votedByMe: boolean; votes_count: number }>>({});
  const [pendingVotes, setPendingVotes] = useState<Set<string>>(new Set());

  // Build query string (one of sort/filter)
  const baseQS = useMemo(() => {
    const u = new URLSearchParams();
    if (email) u.set("email", email);
    if (name) u.set("name", name);
    if (q) u.set("q", q);
    if (filter !== "all") u.set("filter", filter);
    else if (sort) u.set("sort", sort);
    return u.toString();
  }, [email, name, q, sort, filter]);

  // Keep URL synced
  useEffect(() => {
    router.replace(`/features?${baseQS}`);
  }, [baseQS, router]);

  // Load a specific page with race condition protection
  async function fetchPage(pageNum: number, isLoadMore = false) {
    const requestId = ++requestIdRef.current;
    const currentSearchTerm = q.trim();

    // Clear previous errors when starting new request
    if (!isLoadMore) {
      setFetchError(null);
      // Disable highlighting while loading new search results
      if (currentSearchTerm !== lastSearchTerm) {
        setShouldHighlight(false);
      }
    }

    try {
      const res = await fetch(`/api/features?${baseQS}&limit=10&page=${pageNum}`, {
        cache: "no-store",
      });

      // Check if this request is still the latest
      if (requestId !== requestIdRef.current) {
        return; // Abort if superseded by newer request
      }

      if (!res.ok) {
        let errorMessage = "Failed to load features";
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Use default error message if response isn't JSON
        }
        throw new Error(errorMessage);
      }

      const data: ApiPage = await res.json();

      // Double-check request is still current after async operation
      if (requestId !== requestIdRef.current) {
        return; // Abort if superseded
      }

      const newItems = data.items || [];

      if (isLoadMore) {
        setItems((prev) => {
          // Prevent duplicates by filtering out items that already exist
          const existingIds = new Set(prev.map((item) => item.id));
          const uniqueNewItems = newItems.filter((item) => !existingIds.has(item.id));
          return [...prev, ...uniqueNewItems];
        });
        setCurrentPage(pageNum);
      } else {
        setItems(newItems);
        setCurrentPage(1);
      }

      setHasMore(!!data.hasMore);
      setFetchError(null); // Clear any previous errors on success

      // Enable highlighting after successful search results are loaded
      if (!isLoadMore && currentSearchTerm) {
        setLastSearchTerm(currentSearchTerm);
        setShouldHighlight(true);
      } else if (!isLoadMore && !currentSearchTerm) {
        // No search term, so no highlighting needed
        setLastSearchTerm("");
        setShouldHighlight(false);
      }

      return newItems;
    } catch (error) {
      // Only log/handle error if this is still the current request
      if (requestId === requestIdRef.current) {
        const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
        setFetchError(errorMessage);
        console.error("Error fetching page:", error);
        throw error;
      }
    }
  }

  // Initial load and reset on sort/filter changes
  useEffect(() => {
    if (!email || !name) return;

    const loadInitialData = async () => {
      setIsInitialLoading(true);
      try {
        await fetchPage(1, false);
      } catch (error) {
        console.error("Error loading initial data:", error);
      } finally {
        setIsInitialLoading(false);
      }
    };

    loadInitialData();
  }, [email, name, sort, filter]); // Reset on sort/filter changes

  // Handle search changes (already debounced by TopBar)
  useEffect(() => {
    if (!email || !name) return;

    // Skip if this is the initial load
    if (isInitialLoading) return;

    const performSearch = async () => {
      setIsSearching(true);
      try {
        await fetchPage(1, false); // Reset to page 1 for new search
      } catch (error) {
        console.error("Error performing search:", error);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [q, email, name, sort, filter]); // Trigger on search changes

  // intersection observer for infinite scroll - stable implementation
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
      if (entry.isIntersecting && hasMore && !isLoadingMore && !isInitialLoading && !isSearching) {
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
  }, [hasMore, isLoadingMore, isInitialLoading, isSearching, currentPage]); // Stable dependencies

  // Additional cleanup on component unmount
  useEffect(() => {
    return cleanupObserver;
  }, []);

  // When user chooses a sort, clear filter
  function applySort(s: FeatureSort) {
    setSort(s);
    setFilter("all");
  }
  // When user chooses a filter, clear sort
  function applyFilter(f: FeatureFilter) {
    setFilter(f);
    setSort(null);
  }

  // Retry function for error handling
  const retryFetch = async () => {
    setIsInitialLoading(true);
    setFetchError(null);
    setShouldHighlight(false); // Reset highlighting on retry
    try {
      await fetchPage(1, false);
    } catch (error) {
      // Error is already handled in fetchPage
    } finally {
      setIsInitialLoading(false);
    }
  };

  // Optimistic vote with proper state management
  async function onToggleVote(id: string, currentVoted: boolean) {
    // Prevent duplicate votes if already pending
    if (pendingVotes.has(id)) return;

    // Find the current item to store original state
    const currentItem = items.find((f) => f.id === id);
    if (!currentItem) return;

    // Store original state for potential revert
    const originalState = {
      votedByMe: !!currentItem.votedByMe,
      votes_count: currentItem.votes_count,
    };

    // Optimistically update the UI immediately with all state changes batched
    const newVotedState = !currentVoted;
    const delta = newVotedState ? 1 : -1;

    // Batch all initial state updates together
    setOriginalVoteStates((prev) => ({ ...prev, [id]: originalState }));
    setPendingVotes((prev) => new Set(prev).add(id));
    setItems((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              votedByMe: newVotedState,
              votes_count: Math.max(0, f.votes_count + delta),
            }
          : f
      )
    );

    try {
      const res = await fetch(`/api/features/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          image_url: undefined, // User profile image URL if available
        }),
      });

      if (res.ok) {
        // Success - update with server data
        const data = await res.json();
        setItems((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  votedByMe: data.voted,
                  votes_count: data.votes_count,
                }
              : f
          )
        );
      } else {
        // Revert to original state on server error
        setItems((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  votedByMe: originalState.votedByMe,
                  votes_count: originalState.votes_count,
                }
              : f
          )
        );
      }
    } catch {
      // Revert to original state on network error
      setItems((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                votedByMe: originalState.votedByMe,
                votes_count: originalState.votes_count,
              }
            : f
        )
      );
    } finally {
      // Clean up pending state and original state
      setPendingVotes((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setOriginalVoteStates((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    }
  }

  if (!email || !name) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold">Feature Requests</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {!email ? "Email" : "Name"} is required. Append <code>{!email ? "?email=you@domain.com" : "?name=Your Name"}</code> to the URL to start.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 ">
      <TopBar
        sort={sort}
        filter={filter}
        onSortChange={applySort}
        onFilterChange={applyFilter}
        q={q}
        onSearchChange={setQ}
        onOpenNew={() => setOpen(true)}
        isRefetching={isSearching || (isLoadingMore && !isInitialLoading)}
        email={email}
        name={name}
      />

      <div className="">
        {isInitialLoading ? (
          <InitialLoader />
        ) : fetchError ? (
          <ErrorDisplay error={fetchError} onRetry={retryFetch} />
        ) : (
          <>
            <div className="space-y-3">
              <FeatureList
                items={items}
                onToggleVote={onToggleVote}
                searchterm={shouldHighlight ? lastSearchTerm : ""}
                onOpenNew={() => setOpen(true)}
                pendingVotes={pendingVotes}
              />
            </div>

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} />

            {/* Enhanced loading states */}
            <LoadMoreIndicator isVisible={isLoadingMore} />
            <EndOfListIndicator show={!hasMore && !isLoadingMore} count={items.length} />
          </>
        )}
      </div>

      <NewFeatureModal
        email={email}
        open={open}
        onClose={() => setOpen(false)}
        name={name}
        imageUrl={undefined} // User profile image URL if available
        onCreated={async () => {
          setOpen(false);
          // reload from first page to include the new item
          setIsInitialLoading(true);
          try {
            await fetchPage(1, false);
          } catch (error) {
            console.error("Error reloading after creation:", error);
          } finally {
            setIsInitialLoading(false);
          }
        }}
      />
    </div>
  );
}

// Main export wrapped with Suspense
export default function FeaturesPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-3xl px-4 py-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-lg">Loading...</div>
          </div>
        </div>
      }
    >
      <FeaturesPageContent />
    </Suspense>
  );
}
