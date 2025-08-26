"use client";

import { BadgeCheck, Bell, Check, ChevronDown, CircleCheck, CircleStar, Megaphone, MessageCircle, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { type Notification, NotificationService } from "@/lib/services/notifications";
import type { FeatureFilter, FeatureSort } from "@/types";

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

const sortLabels: Record<Exclude<FeatureSort, null>, string> = {
  trending: "Trending",
  top: "Top",
  new: "New",
};

const filterLabels: Record<FeatureFilter, string> = {
  all: "All",
  under_review: "Under Review",
  planned: "Planned",
  in_progress: "In Progress",
  done: "Complete",
  mine: "My Own",
};

const getNotificationIcon = (type: Notification["type"]) => {
  switch (type) {
    case "comment":
      return <MessageCircle className=" text-blue-500 !w-5 !h-5" strokeWidth={2} />;
    case "status_change":
      return <Megaphone className=" text-purple-500 !w-5 !h-5" strokeWidth={2} />;
    case "feature_deleted":
      return <Trash2 className=" text-red-500 !w-5 !h-5" strokeWidth={2} />;
    case "vote":
      return <CircleCheck className=" text-[#0d9488] !w-5 !h-5" strokeWidth={2} />;
    default:
      return <Bell className=" text-gray-500 !w-5 !h-5" strokeWidth={2} />;
  }
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
  email?: string;
  name?: string;
}) {
  const [search, setSearch] = useState(props.q);
  const [isSearching, setIsSearching] = useState(!!props.q && props.q.trim() !== "");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [_currentUser, setCurrentUser] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // keep local value in sync if parent changes q while not actively typing
  useEffect(() => {
    if (!isSearching) setSearch(props.q);
  }, [props.q, isSearching]);

  // debounce search (300ms)
  useEffect(() => {
    const t = setTimeout(() => props.onSearchChange(search), 300);
    return () => clearTimeout(t);
  }, [search, props.onSearchChange]);

  // Load notifications on mount and when email/name changes
  useEffect(() => {
    const initializeNotifications = async () => {
      if (!props.email || !props.name) return;

      try {
        setCurrentUser(props.email); // Use email as user identifier
        await loadNotifications(props.email, props.name);
      } catch (error) {
        console.error("Error initializing notifications:", error);
        setIsLoadingNotifications(false);
      }
    };

    initializeNotifications();
  }, [props.email, props.name]);

  // Note: No real-time subscriptions - using simple polling for mobile app

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

  // Load notifications from database
  async function loadNotifications(email: string, name: string) {
    try {
      setIsLoadingNotifications(true);
      const data = await NotificationService.getNotifications(email, name);
      setNotifications(data);
    } catch (error) {
      console.error("Error loading notifications:", error);
    } finally {
      setIsLoadingNotifications(false);
    }
  }

  // Mark notification as read
  async function markAsRead(notificationId: string) {
    if (!props.email || !props.name) return;

    try {
      // Update local state immediately for better UX
      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)));

      // Update in database
      await NotificationService.markAsRead(notificationId, props.email, props.name);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      // Revert local state on error - but don't reload all notifications to avoid infinite loops
      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, read: false } : n)));
    }
  }

  // Mark all notifications as read
  async function markAllAsRead() {
    if (!props.email || !props.name) return;

    const originalNotifications = [...notifications]; // Save original state for revert

    try {
      // Update local state immediately
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

      // Update in database
      await NotificationService.markAllAsRead(props.email, props.name);
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      // Revert local state on error - but don't reload all notifications to avoid infinite loops
      setNotifications(originalNotifications);
    }
  }

  // Note: No manual delete - old notifications are automatically cleaned up
  // by the database after 30 days if they're read

  // Format timestamp for display
  function formatTimestamp(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString();
  }

  // Calculate unread count
  const unreadCount = notifications.filter((n) => !n.read).length;

  // The button text shows either the active filter label or active sort
  const triggerText = props.filter !== "all" ? filterLabels[props.filter] : props.sort ? sortLabels[props.sort] : "Trending";

  return (
    <div>
      <div className="font-semibold mb-5 text-lg">Feature Requests</div>
      <div className="flex items-center justify-between gap-4 relative bg-[#fcfcfc] border border-gray-200 border-b-0 px-3 py-3 rounded-t-xl">
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
                    {(["under_review", "planned", "in_progress", "done", "mine"] as FeatureFilter[]).map((f) => (
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
              {props.isRefetching && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent flex-shrink-0" />
              )}

              {/* Clear button - only show if there's text */}

              <button
                onClick={closeSearch}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                title="Clear search"
                type="button"
              >
                <X size={16} className="text-muted-foreground hover:text-foreground" />
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

          <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-11 w-11 relative" title="Notifications">
                <Bell size={18} />
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="md:w-90 w-[calc(100vw-2rem)] p-0 translate-x-[1rem]">
              <div className="flex items-center justify-between p-3">
                <DropdownMenuLabel className="p-0 text-base font-semibold">Notifications</DropdownMenuLabel>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs h-6 px-2">
                    Mark all read
                  </Button>
                )}
              </div>
              <DropdownMenuSeparator />
              {isLoadingNotifications ? (
                <div className="p-4 text-center text-muted-foreground">
                  <div className="h-6 w-6 animate-spin rounded-full border border-muted-foreground border-t-transparent mx-auto mb-2" />
                  <p className="text-sm">Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="pt-8 pb-10 text-center text-muted-foreground">
                  <Bell size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {notifications.map((notification, index) => (
                    <div key={notification.id} className="group">
                      <DropdownMenuItem
                        className={`group/item p-3 cursor-pointer hover:bg-muted/50 ${!notification.read ? "bg-blue-50/50" : ""}`}
                        onClick={() => markAsRead(notification.id)}
                      >
                        <div className="flex items-start gap-3 w-full">
                          <div className="flex-shrink-0 mt-0.5">{getNotificationIcon(notification.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate  ${!notification.read ? "text-foreground" : "text-muted-foreground"}`}>
                                  {notification.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {`${notification.message.charAt(0).toUpperCase()}${notification.message.slice(1)} `}
                                  {notification.feature_title ? <span className="font-medium">{notification.feature_title}</span> : ""}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">{formatTimestamp(notification.created_at)}</p>
                              </div>
                              {/* Auto-cleanup: Old notifications are automatically deleted after 30 days if read */}
                            </div>
                          </div>
                          {!notification.read && (
                            <div className="flex-shrink-0">
                              <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            </div>
                          )}
                        </div>
                      </DropdownMenuItem>
                      {index < notifications.length - 1 && <Separator className="my-1" />}
                    </div>
                  ))}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size={"icon"} onClick={props.onOpenNew} className="flex-shrink-0 text-white h-11 w-11 p-0">
            <Plus size={20} className=" " />
          </Button>
        </div>
      </div>
    </div>
  );
}
