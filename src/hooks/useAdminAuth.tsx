"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AdminUser } from "@/types/admin";

const STORAGE_KEY = "__admin_auth_v2";

type LoginResult = { success: true; admin: AdminUser } | { success: false; error?: string };

type Ctx = {
  currentAdmin: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
};

const AdminAuthContext = createContext<Ctx | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const persist = useCallback((admin: AdminUser | null) => {
    if (typeof window === "undefined") return;
    if (admin) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(admin));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    bcRef.current?.postMessage({ type: "admin-auth", admin });
  }, []);

  const hydrate = useCallback(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    const admin = raw ? (JSON.parse(raw) as AdminUser) : null;
    setCurrentAdmin(admin);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    hydrate();
    setIsLoading(false);
  }, [hydrate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    bcRef.current = new BroadcastChannel("admin-auth");
    const bc = bcRef.current;
    bc.onmessage = (evt) => {
      if (evt?.data?.type === "admin-auth") {
        setCurrentAdmin(evt.data.admin ?? null);
      }
    };
    return () => bc.close();
  }, []);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false): Promise<LoginResult> => {
      try {
        const res = await fetch("/api/admins/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, rememberMe }),
          credentials: "include", // Include cookies in the request
        });

        if (!res.ok) {
          const js = await res.json().catch(() => ({}));
          const error = new Error(js.error || "Invalid credentials");
          (error as any).status = res.status;
          (error as any).response = { status: res.status, data: js };
          throw error;
        }

        const js = await res.json();
        const admin: AdminUser = js.admin;

        setCurrentAdmin(admin);
        persist(admin);

        return { success: true, admin };
      } catch (error) {
        // Return the actual error message instead of generic "Network error"
        const errorMessage = error instanceof Error ? error.message : "Network error";
        return { success: false, error: errorMessage };
      }
    },
    [persist]
  );

  const logout = useCallback(async () => {
    try {
      // Call logout endpoint to revoke tokens (cookies will be sent automatically)
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies in the request
      });
    } catch (error) {
      console.error("Logout API error:", error);
    } finally {
      // Always clear local state regardless of API call success
      setCurrentAdmin(null);
      persist(null);
    }
  }, [persist]);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include cookies in the request
      });

      if (res.ok) {
        const js = await res.json();
        const admin: AdminUser = js.admin;

        setCurrentAdmin(admin);
        persist(admin);
      } else {
        // Refresh failed, clear auth state
        setCurrentAdmin(null);
        persist(null);
      }
    } catch (error) {
      console.error("Refresh auth error:", error);
      setCurrentAdmin(null);
      persist(null);
    }
  }, [persist]);

  const value = useMemo<Ctx>(
    () => ({
      currentAdmin,
      isAuthenticated: !!currentAdmin,
      isLoading,
      login,
      logout,
      refreshAuth,
    }),
    [currentAdmin, isLoading, login, logout, refreshAuth]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): Ctx {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within <AdminAuthProvider>");
  return ctx;
}
