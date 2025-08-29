"use client";

import React, { useEffect, useState, useRef } from "react";
import { ChevronDown, Globe, Loader, MoreHorizontal, Plus, RefreshCw, Trash2, Copy } from "lucide-react";
import { adminApi } from "@/services/adminApi";
import type { App } from "@/types/admin";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAdminAuth } from "@/hooks/useAdminAuth";

interface AppSelectorProps {
  selectedAppId: string | null;
  onAppSelect: (app: App | null) => void;
  restoreSelectedApp?: (availableApps: App[]) => void;
  onAddApp?: () => void;
  onDeleteApp?: () => void;
  className?: string;
}

// Global apps cache to avoid multiple loads
let globalAppsCache: { apps: App[]; timestamp: number } | null = null;
const APPS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Event system for cache updates
const cacheUpdateListeners = new Set<() => void>();

// Export cache management functions
export const getAppsCache = () => globalAppsCache;
export const setAppsCache = (cache: { apps: App[]; timestamp: number } | null) => {
  globalAppsCache = cache;
  // Notify all listeners of cache update
  cacheUpdateListeners.forEach((listener) => listener());
};

export const addAppToCache = (newApp: App) => {
  if (globalAppsCache) {
    globalAppsCache = {
      apps: [...globalAppsCache.apps, newApp],
      timestamp: Date.now(),
    };
  } else {
    // If no cache exists, create one
    globalAppsCache = {
      apps: [newApp],
      timestamp: Date.now(),
    };
  }
  // Notify all listeners of cache update
  cacheUpdateListeners.forEach((listener) => listener());
};

export const removeAppFromCache = (appId: string) => {
  if (globalAppsCache) {
    globalAppsCache = {
      apps: globalAppsCache.apps.filter((app) => app.id !== appId),
      timestamp: Date.now(),
    };
  }
  // Notify all listeners of cache update
  cacheUpdateListeners.forEach((listener) => listener());
};

export const subscribeToCacheUpdates = (listener: () => void) => {
  cacheUpdateListeners.add(listener);
  return () => {
    cacheUpdateListeners.delete(listener);
  };
};

export function AppSelector({
  selectedAppId,
  onAppSelect,
  restoreSelectedApp: propRestoreSelectedApp,
  onAddApp,
  onDeleteApp,
  className = "",
}: AppSelectorProps) {
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAutoSelectedRef = useRef(false);
  const hasRestoredSelectionRef = useRef(false);
  const { currentAdmin } = useAdminAuth();

  // Use the parent's restoreSelectedApp function, or create a fallback that does nothing
  const restoreSelectedApp = propRestoreSelectedApp || (() => {});

  // Sync with global cache when it updates
  useEffect(() => {
    const unsubscribe = subscribeToCacheUpdates(() => {
      if (globalAppsCache) {
        const now = Date.now();
        if (now - globalAppsCache.timestamp < APPS_CACHE_TTL) {
          setApps(globalAppsCache.apps);

          // Restore selected app from storage if not already restored
          if (globalAppsCache.apps.length > 0 && !hasRestoredSelectionRef.current) {
            hasRestoredSelectionRef.current = true;
            restoreSelectedApp(globalAppsCache.apps);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [selectedAppId, onAppSelect, restoreSelectedApp]);

  const loadApps = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const now = Date.now();

      // Check if we have fresh cached data
      if (globalAppsCache && now - globalAppsCache.timestamp < APPS_CACHE_TTL) {
        // Use cached data immediately
        setApps(globalAppsCache.apps);

        // Restore selected app from storage if not already restored
        if (globalAppsCache.apps.length > 0 && !hasRestoredSelectionRef.current) {
          hasRestoredSelectionRef.current = true;
          restoreSelectedApp(globalAppsCache.apps);
        }

        setIsLoading(false);

        // Refresh cache in background
        setIsRefreshing(true);
        try {
          const freshApps = await adminApi.getApps();
          setAppsCache({ apps: freshApps, timestamp: now });
        } catch (refreshError) {
          console.error("Error refreshing apps cache:", refreshError);
          // Keep using cached data if refresh fails
        } finally {
          setIsRefreshing(false);
        }

        return;
      }

      // No cache or stale cache - load fresh data
      const freshApps = await adminApi.getApps();
      setAppsCache({ apps: freshApps, timestamp: now });
      setApps(freshApps);

      // Restore selected app from storage if not already restored
      if (freshApps.length > 0 && !hasRestoredSelectionRef.current) {
        hasRestoredSelectionRef.current = true;
        restoreSelectedApp(freshApps);
      }

      setIsLoading(false);
    } catch (error) {
      console.error("Error loading apps:", error);
      setError("Failed to load apps");
      toast.error("Failed to load apps");
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  // Safety net: if we have apps but no selected app, auto-select first one
  useEffect(() => {
    if (apps.length > 0 && !selectedAppId && !isLoading && !hasRestoredSelectionRef.current) {
      hasRestoredSelectionRef.current = true;
      restoreSelectedApp(apps);
    }
  }, [apps, selectedAppId, isLoading, restoreSelectedApp]);

  const handleCopyUserUrl = async () => {
    if (!selectedApp) {
      toast.error("No app selected");
      return;
    }

    try {
      // Get the current hosted URL dynamically
      const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
      const baseUrl = `${currentOrigin}/features`;

      const params = new URLSearchParams({
        app_slug: selectedApp.slug,
        email: "***",
        name: "***",
        url_image: "***",
        sort: "trending",
      });

      const fullUrl = `${baseUrl}?${params.toString()}`;

      await navigator.clipboard.writeText(fullUrl);
      toast.success("User URL template copied to clipboard");
    } catch (error) {
      console.error("Failed to copy URL:", error);
      toast.error("Failed to copy URL to clipboard");
    }
  };

  // Find selected app from current apps list
  const selectedApp = selectedAppId ? apps.find((app) => app.id === selectedAppId) || null : null;

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg ${className}`}>
        <Loader className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading apps...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-destructive/10 text-destructive rounded-lg ${className}`}>
        <Globe className="w-4 h-4" />
        <span className="text-sm">Access denied - Admin login required</span>
        <button onClick={loadApps} className="text-xs underline hover:no-underline ml-2">
          Retry
        </button>
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg ${className}`}>
        <Globe className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">No apps available</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {(onAddApp || onDeleteApp) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex-shrink-0 px-2 py-[13px] h-auto mr-1">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {onAddApp && (
              <DropdownMenuItem onClick={onAddApp}>
                <Plus className="w-4 h-4 mr-2" />
                Add app
              </DropdownMenuItem>
            )}
            {selectedApp && currentAdmin && (
              <DropdownMenuItem onClick={handleCopyUserUrl}>
                <Copy className="w-4 h-4 mr-2" />
                Copy user URL
              </DropdownMenuItem>
            )}
            {onDeleteApp && selectedApp && (
              <DropdownMenuItem onClick={onDeleteApp} className="text-destructive focus:text-destructive">
                <Trash2 className="w-4 h-4 mr-2 text-destructive" />
                Delete current app
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex-1 sm:flex-none sm:w-auto sm:min-w-[200px] justify-between px-4 py-3 h-auto">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Globe className="w-4 h-4 text-muted-foreground" />
                {isRefreshing && <RefreshCw className="w-3 h-3 text-primary absolute -top-1 -right-1 animate-spin" />}
              </div>
              <div className="text-left min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{selectedApp?.name || "Loading..."}</div>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-full min-w-[200px]">
          {apps.map((app) => (
            <DropdownMenuItem key={app.id} onClick={() => onAppSelect(app)} className={selectedAppId === app.id ? "bg-accent" : ""}>
              <div className="flex items-center gap-2 w-full">
                <Globe className="w-4 h-4" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{app.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{app.slug}</div>
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
