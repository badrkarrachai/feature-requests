"use client";

import type { Feature } from "@/types";
import FeatureCard from "./FeatureCard";

export default function FeatureList({
  items = [],
  onToggleVote,
  searchterm,
  onOpenNew,
  pendingVotes = new Set(),
  email,
  name,
}: {
  items?: Feature[];
  searchterm: string;
  onOpenNew: () => void;
  onToggleVote: (id: string, currentVoted: boolean) => void;
  pendingVotes?: Set<string>;
  email: string;
  name: string;
}) {
  if ((!Array.isArray(items) || items.length === 0) && searchterm && searchterm.trim() !== "") {
    return (
      <div className="border border-gray-200 rounded-b-xl border-t-0">
        <div className="flex flex-col items-center justify-center py-12 px-8">
          {/* Search/Filter Icon */}
          <div className="mb-4 p-3 rounded-full bg-amber-50 border border-amber-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-amber-500" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
              <line x1="9" y1="11" x2="13" y2="11" />
            </svg>
          </div>

          {/* Dynamic heading based on context */}
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>

          {/* Context-aware description */}
          <div className="text-center space-y-1 mb-6">
            <p className="text-sm text-gray-600">We couldn't find any feature requests matching</p>
            <p className="text-sm font-medium text-gray-800">{searchterm} or selected filters</p>
          </div>
        </div>
      </div>
    );
  }
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div className="border border-gray-200 rounded-b-xl border-t-0">
        <div className="flex flex-col items-center justify-center py-16 px-8">
          {/* Icon */}
          <div className="mb-4 p-3 rounded-full bg-gray-50 border border-gray-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-400" stroke="currentColor" strokeWidth="1.5">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>

          {/* Main text */}
          <h3 className="text-lg font-medium text-gray-900 mb-2">No feature requests yet</h3>

          {/* Subtitle */}
          <p className="text-sm text-gray-500 text-center max-w-sm leading-relaxed">
            Be the first to share your ideas and help shape the future of this product.
          </p>

          {/* Optional CTA */}
          <button
            type="button"
            onClick={onOpenNew}
            className="mt-6 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors duration-200"
          >
            Request a feature
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="border border-gray-200 rounded-b-xl border-t-0">
      {items.map((it) => (
        <FeatureCard
          showBottomBorder={it !== items[items.length - 1]}
          key={it.id}
          item={it}
          onToggleVote={onToggleVote}
          searchTerm={searchterm}
          isSearchActive={!!(searchterm && searchterm.trim())}
          isVotePending={pendingVotes.has(it.id)}
          email={email}
          name={name}
        />
      ))}
    </div>
  );
}
