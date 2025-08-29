"use client";

import { useState, useEffect, useCallback } from "react";
import type { App } from "@/types/admin";

const STORAGE_KEY = "selected_app_id";

interface UsePersistentAppSelectionReturn {
  selectedApp: App | null;
  selectedAppId: string | null;
  setSelectedApp: (app: App | null) => void;
  restoreSelectedApp: (availableApps: App[]) => void;
}

/**
 * Custom hook to persist selected app across page refreshes using localStorage
 * Handles restoration of selected app and cleanup of invalid selections
 */
export function usePersistentAppSelection(): UsePersistentAppSelectionReturn {
  const [selectedApp, setSelectedAppState] = useState<App | null>(null);

  // Get selected app ID from localStorage
  const getStoredAppId = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.warn("Failed to read from localStorage:", error);
      return null;
    }
  }, []);

  // Store selected app ID to localStorage
  const storeAppId = useCallback((appId: string | null) => {
    if (typeof window === "undefined") return;
    try {
      if (appId) {
        localStorage.setItem(STORAGE_KEY, appId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.warn("Failed to write to localStorage:", error);
    }
  }, []);

  // Set selected app and persist to storage
  const setSelectedApp = useCallback(
    (app: App | null) => {
      setSelectedAppState(app);
      storeAppId(app?.id || null);
    },
    [storeAppId]
  );

  // Restore selected app from storage, validating it exists in available apps
  const restoreSelectedApp = useCallback(
    (availableApps: App[]) => {
      const storedAppId = getStoredAppId();

      if (availableApps.length === 0) {
        // No apps available - reset selection
        setSelectedApp(null);
        return;
      }

      if (!storedAppId) {
        // No stored app - auto-select first available app
        const firstApp = availableApps[0];
        setSelectedApp(firstApp);
        return;
      }

      // Find the stored app in the available apps
      const storedApp = availableApps.find((app) => app.id === storedAppId);

      if (storedApp) {
        // Stored app still exists - restore it
        setSelectedAppState(storedApp);
      } else {
        // Stored app no longer exists - select first available app and update storage
        const firstApp = availableApps[0];
        setSelectedApp(firstApp);
      }
    },
    [getStoredAppId]
  );

  // Initialize from localStorage on mount (client-side only)
  useEffect(() => {
    // This will be called when available apps are loaded
    // The restoreSelectedApp function should be called from the component
    // that has access to the available apps list
  }, []);

  return {
    selectedApp,
    selectedAppId: selectedApp?.id || null,
    setSelectedApp,
    restoreSelectedApp,
  };
}
