"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AdminUser } from "@/types/admin";

const STORAGE_KEY = "__admin_auth_v1";
type LoginResult = { success: true; admin: AdminUser } | { success: false; error?: string };

type Ctx = {
  currentAdmin: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  refreshAuth: () => void;
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
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        const res = await fetch("/api/admins/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const js = await res.json().catch(() => ({}));
          return { success: false, error: js.error || "Invalid credentials" };
        }
        const js = await res.json();
        const admin: AdminUser = js.admin;
        setCurrentAdmin(admin); // in-memory
        persist(admin); // localStorage + broadcast

        // Store password in sessionStorage for API calls that require it
        // This is a temporary solution until the API is properly refactored
        if (typeof window !== "undefined") {
          sessionStorage.setItem("__admin_password_v1", password);
        }

        return { success: true, admin };
      } catch {
        return { success: false, error: "Network error" };
      }
    },
    [persist]
  );

  const logout = useCallback(() => {
    setCurrentAdmin(null);
    persist(null);
    // Clear stored password from sessionStorage
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("__admin_password_v1");
    }
  }, [persist]);

  const refreshAuth = useCallback(() => {
    hydrate();
  }, [hydrate]);

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
