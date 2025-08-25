"use client";

import { useCallback, useEffect, useState } from "react";

export function useCSRF() {
  const [csrfToken, setCSRFToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCSRFToken = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/csrf", {
        method: "GET",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setCSRFToken(data.csrfToken);
      } else {
        console.error("Failed to fetch CSRF token");
        setCSRFToken(null);
      }
    } catch (error) {
      console.error("Error fetching CSRF token:", error);
      setCSRFToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCSRFToken();
  }, [fetchCSRFToken]);

  /**
   * Get CSRF token from cookie (client-side readable)
   */
  const getCSRFTokenFromCookie = useCallback((): string | null => {
    if (typeof window === "undefined") return null;

    const name = "csrf-token";
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
      return parts.pop()?.split(";").shift() || null;
    }

    return null;
  }, []);

  /**
   * Get headers with CSRF token for authenticated requests
   */
  const getCSRFHeaders = useCallback((): Record<string, string> => {
    const token = csrfToken || getCSRFTokenFromCookie();

    if (!token) {
      return {};
    }

    return {
      "X-CSRF-Token": token,
    };
  }, [csrfToken, getCSRFTokenFromCookie]);

  /**
   * Make a request with CSRF protection
   */
  const fetchWithCSRF = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const csrfHeaders = getCSRFHeaders();

      const mergedOptions: RequestInit = {
        ...options,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders,
          ...options.headers,
        },
      };

      return fetch(url, mergedOptions);
    },
    [getCSRFHeaders]
  );

  return {
    csrfToken,
    isLoading,
    fetchCSRFToken,
    getCSRFHeaders,
    fetchWithCSRF,
    getCSRFTokenFromCookie,
  };
}
