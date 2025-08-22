"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Search, Bell, Plus, ChevronDown, X } from "lucide-react";
import type { FeatureFilter, FeatureSort } from "@/types";

const sortLabels: Record<Exclude<FeatureSort, null>, string> = {
  trending: "Trending",
  top: "Top",
  new: "New",
};

const filterLabels: Record<FeatureFilter, string> = {
  all: "All",
  open: "Under Review",
  planned: "Planned",
  in_progress: "In Progress",
  done: "Complete",
  mine: "My Own",
};

export default function TopBar(props: {
  sort: FeatureSort; // null when a filter is active
  filter: FeatureFilter; // "all" when a sort is active
  onSortChange: (s: FeatureSort) => void; // parent clears filter -> "all"
  onFilterChange: (f: FeatureFilter) => void; // parent clears sort -> null
  q: string;
  onSearchChange: (q: string) => void;
  onOpenNew: () => void;
  isRefetching?: boolean;
}) {
  const [search, setSearch] = useState(props.q);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // keep local value in sync if parent changes q while not actively typing
  useEffect(() => {
    if (!isSearching) setSearch(props.q);
  }, [props.q, isSearching]);

  // debounce search (300ms)
  useEffect(() => {
    const t = setTimeout(() => props.onSearchChange(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openSearch() {
    // prefill with current query and focus
    setSearch(props.q);
    setIsSearching(true);
    // next tick focus
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function closeSearch() {
    setIsSearching(false);
    setSearch("");
    props.onSearchChange("");
  }

  // keyboard: ESC to close
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    }
  }

  // The button text shows either the active filter label or active sort
  const triggerText = props.filter !== "all" ? filterLabels[props.filter] : props.sort ? sortLabels[props.sort] : "Trending";

  return (
    <div>
      <div className="font-semibold mb-5 text-lg">Feature Requests</div>
      <div className="flex items-center justify-between gap-4 relative bg-[#fcfcfc] border px-3 py-3 rounded-t-xl ">
        {/* Left side - Dropdown Menu (fixed width) */}
        {!isSearching && (
          <div className="flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-w-[160px] justify-between h-11">
                  {triggerText}
                  <ChevronDown size={16} className="opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[300px]">
                <div className="grid grid-cols-2">
                  {/* SORT column */}
                  <div className="p-2 border-r">
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">SORT</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(["trending", "top", "new"] as Exclude<FeatureSort, null>[]).map((s) => (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => props.onSortChange(s)} // parent sets filter='all'
                      >
                        <span className="inline-block w-2 text-primary font-bold text-xl">
                          {/* Dot only if a sort is active AND no filter */}
                          {props.filter === "all" && props.sort === s ? "•" : ""}
                        </span>
                        {sortLabels[s]}
                      </DropdownMenuItem>
                    ))}
                  </div>

                  {/* FILTER column */}
                  <div className="p-2">
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">FILTER</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(["open", "planned", "in_progress", "done", "mine"] as FeatureFilter[]).map((f) => (
                      <DropdownMenuItem
                        key={f}
                        onClick={() => props.onFilterChange(f)} // parent sets sort=null
                      >
                        <span className="inline-block w-2 text-primary font-bold text-xl">
                          {/* Dot only when a filter is active */}
                          {props.filter !== "all" && props.filter === f ? "•" : ""}
                        </span>
                        {filterLabels[f]}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Search Input with inline clear button */}
        {isSearching && (
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search..."
              className="pl-9 pr-20 w-full h-11" // Increased right padding for clear + loading
            />

            {/* Right side of input - Loading + Clear button */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {/* Loading indicator */}
              {props.isRefetching && <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />}

              {/* Clear button - only show if there's text */}

              <button onClick={closeSearch} className="p-1 rounded-full hover:bg-gray-100 transition-colors" title="Clear search" type="button">
                <X size={18} className="text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          </div>
        )}

        {/* Spacer when dropdown is visible */}
        {!isSearching && <div className="flex-1"></div>}

        {/* Right side - Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Search trigger button - only show when not searching */}
          {!isSearching && (
            <Button variant="outline" size="icon" className="h-11 w-11" onClick={openSearch} title="Search">
              <Search size={18} />
            </Button>
          )}

          <Button variant="outline" size="icon" className="h-11 w-11" title="Notifications">
            <Bell size={18} />
          </Button>

          <Button size={"icon"} onClick={props.onOpenNew} className="flex-shrink-0 text-white h-11 w-11 p-0">
            <Plus size={20} className=" " />
          </Button>
        </div>
      </div>
    </div>
  );
}
