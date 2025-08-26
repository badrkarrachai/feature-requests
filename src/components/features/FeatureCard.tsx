"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Feature } from "@/types";
import StatusBadge from "./StatusBadge";
import { formatNumber } from "@/lib/utils/numbers";

// Utility function to highlight search terms in text
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightSearchText = (text: string, query: string): React.ReactNode => {
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
};

export default function FeatureCard({
  item,
  showBottomBorder,
  isFirstCard = false,
  onToggleVote,
  searchTerm = "",
  isSearchActive = false,
  isVotePending = false,
  email,
  name,
}: {
  item: Feature;
  showBottomBorder: boolean;
  isFirstCard?: boolean;
  onToggleVote: (id: string, currentVoted: boolean) => void;
  searchTerm?: string;
  isSearchActive?: boolean;
  isVotePending?: boolean;
  email: string;
  name: string;
}) {
  const router = useRouter();

  // Only highlight when we have both a search term AND search is active
  // This prevents highlighting during typing/loading phases
  const shouldShowHighlighting = isSearchActive && searchTerm && searchTerm.trim() !== "";

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on the vote button
    if ((e.target as HTMLElement).closest("button")) {
      return;
    }

    // Build the URL with email and name parameters
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    if (name) params.set("name", name);
    const queryString = params.toString();
    const url = queryString ? `/features/${item.id}?${queryString}` : `/features/${item.id}`;

    router.push(url);
  };

  // Memoize highlighted text to prevent unnecessary recalculations
  const highlightedTitle = useMemo(
    () => (shouldShowHighlighting ? highlightSearchText(item.title, searchTerm) : item.title),
    [item.title, searchTerm, shouldShowHighlighting]
  );

  const highlightedDescription = useMemo(
    () => (shouldShowHighlighting ? highlightSearchText(item.description, searchTerm) : item.description),
    [item.description, searchTerm, shouldShowHighlighting]
  );
  return (
    <Card
      className={`
        border-x-0 shadow-none cursor-pointer hover:bg-gray-50/50 transition-colors
        ${isFirstCard ? "border-t border-t-gray-200" : "border-t-0"}
        ${showBottomBorder ? "border-b border-b-gray-200 rounded-none" : "border-b-0 rounded-t-none rounded-b-xl"}
      `}
      onClick={handleCardClick}
    >
      <CardContent className="px-4 flex items-center justify-between">
        <div className="flex-1 pr-3">
          <h3 className="font-semibold text-gray-900 line-clamp-2 overflow-hidden">{highlightedTitle}</h3>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{highlightedDescription}</p>

          <div className="mt-3 flex items-center gap-3 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-comment-square-icon lucide-comment-square"
              >
                <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
              </svg>
              <span>{formatNumber(item.comments_count)}</span>
            </div>
            <div className="text-sm">•</div>
            <StatusBadge status={item.status} />
          </div>
        </div>

        {/* Upvote block (no layout shift) */}
        <Button
          variant="outline"
          size="sm"
          className={` h-[50px] flex flex-col items-center shadow-none font-normal justify-center rounded-md px-[0.6rem] ${
            item.votedByMe ? "border-primary bg-primary/5 text-primary" : ""
          }`}
          onClick={() => !isVotePending && onToggleVote(item.id, !!item.votedByMe)}
          disabled={isVotePending}
          aria-pressed={item.votedByMe}
        >
          <div className="flex flex-col items-center">
            {isVotePending ? (
              <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-chevron-up-icon lucide-chevron-up"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            )}
            <span className="text-sm font-normal">{formatNumber(item.votes_count)}</span>
          </div>
        </Button>
      </CardContent>
    </Card>
  );
}
