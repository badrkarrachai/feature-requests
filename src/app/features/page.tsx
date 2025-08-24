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

  const [items, setItems] = useState<Feature[]>([]);
  const [q, setQ] = useState(params.get("q") || "");
  const [sort, setSort] = useState<FeatureSort>(initialSort);
  const [filter, setFilter] = useState<FeatureFilter>(initialFilter);

  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);

  // optimistic vote pending map
  const [pendingVotes, setPendingVotes] = useState<Record<string, 1 | -1>>({});

  // overlay optimistic toggles on any server list
  function withPendingOverlay(list: Feature[]) {
    if (!list?.length) return list;
    return list.map((f) => {
      const delta = pendingVotes[f.id] ?? 0;
      if (!delta) return f;
      return {
        ...f,
        votedByMe: !f.votedByMe,
        votes_count: Math.max(0, f.votes_count + delta),
      };
    });
  }

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

  // Load a specific page and append/replace
  async function fetchPage(p: number, mode: "replace" | "append") {
    const res = await fetch(`/api/features?${baseQS}&limit=10&page=${p}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to load");
    const data: ApiPage = await res.json();
    const newList = withPendingOverlay(data.items || []);

    setItems((prev) => (mode === "replace" ? newList : [...prev, ...newList]));
    setHasMore(!!data.hasMore);
    setPage(data.page);
  }

  // initial load / parameter reset
  useEffect(() => {
    if (!email) return;
    if (!name) return;
    (async () => {
      setInitialLoading(true);
      try {
        await fetchPage(1, "replace");
      } finally {
        setInitialLoading(false);
      }
    })();
    // reset scroll could be done here if needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, name, sort, filter]); // Only reload on sort/filter changes, not search

  // Handle search queries separately without full loading overlay
  useEffect(() => {
    if (!email || !name) return;
    // Skip if this is the initial load (when items is empty and no search)
    if (items.length === 0 && q === "") return;

    const performSearch = async () => {
      setSearching(true);
      try {
        await fetchPage(1, "replace");
      } finally {
        setSearching(false);
      }
    };

    performSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]); // Only trigger on search query changes

  // intersection observer for infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loadingMore && !initialLoading) {
          setLoadingMore(true);
          try {
            await fetchPage(page + 1, "append");
          } finally {
            setLoadingMore(false);
          }
        }
      },
      { rootMargin: "300px 0px 300px 0px", threshold: 0 } // eager prefetch
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, initialLoading, page, baseQS, email, name]); // reload observer when deps change

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

  // Pure optimistic vote; only revert on failure
  async function onToggleVote(id: string, currentVoted: boolean) {
    const delta: 1 | -1 = currentVoted ? -1 : 1;

    setPendingVotes((prev) => ({ ...prev, [id]: delta }));
    setItems((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              votedByMe: !currentVoted,
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
      if (!res.ok) {
        // revert on server error
        setItems((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  votedByMe: currentVoted,
                  votes_count: Math.max(0, f.votes_count - delta),
                }
              : f
          )
        );
      }
    } catch {
      // revert on network error
      setItems((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                votedByMe: currentVoted,
                votes_count: Math.max(0, f.votes_count - delta),
              }
            : f
        )
      );
    } finally {
      setPendingVotes((prev) => {
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
        isRefetching={searching || (loadingMore && !initialLoading)}
        email={email}
        name={name}
      />

      <div className="">
        {initialLoading ? (
          <InitialLoader />
        ) : (
          <>
            {
              <div className="space-y-3">
                <FeatureList items={items} onToggleVote={onToggleVote} searchterm={q} onOpenNew={() => setOpen(true)} />
              </div>
            }

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} />

            {/* Enhanced loading states */}
            <LoadMoreIndicator isVisible={loadingMore} />
            <EndOfListIndicator show={!hasMore && !loadingMore} count={items.length} />
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
          setInitialLoading(true);
          try {
            await fetchPage(1, "replace");
          } finally {
            setInitialLoading(false);
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
