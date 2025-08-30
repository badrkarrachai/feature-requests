import type { AdminStats, AdminUser, FeatureRequest, App } from "@/types/admin";

class AdminApi {
  // Caching and request deduplication
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private pendingRequests = new Map<string, Promise<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly APPS_TTL = 10 * 60 * 1000; // 10 minutes for apps (less likely to change)

  private getCacheKey(endpoint: string, params?: Record<string, any>): string {
    const paramStr = params ? JSON.stringify(params) : "";
    return `${endpoint}${paramStr}`;
  }

  private getCachedData<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > cached.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCachedData(key: string, data: any, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  private async dedupedRequest<T>(key: string, requestFn: () => Promise<T>, ttl: number = this.DEFAULT_TTL): Promise<T> {
    // Check cache first
    const cached = this.getCachedData<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Check if request is already in progress
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    // Create new request
    const request = requestFn()
      .then((data) => {
        this.setCachedData(key, data, ttl);
        return data;
      })
      .finally(() => {
        this.pendingRequests.delete(key);
      });

    this.pendingRequests.set(key, request);
    return request;
  }

  // Cache invalidation helpers
  public invalidateByPrefix(prefix: string) {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  public invalidateFeaturesCache() {
    this.invalidateByPrefix("getFeatures");
  }

  public invalidateFeaturesStatsCache() {
    this.invalidateByPrefix("getFeaturesStats");
    this.invalidateByPrefix("getAdminStats");
  }

  // Debug utility to check authentication state
  public debugAuthState(): void {
    if (typeof window === "undefined") {
      console.log("Server environment - no localStorage access");
      return;
    }

    console.log("=== Admin Authentication Debug ===");
    console.log("localStorage keys:", Object.keys(localStorage));

    // Check for old auth data
    const oldAuth = localStorage.getItem("__admin_auth_v1");
    const oldPassword = sessionStorage.getItem("__admin_password_v1");

    // Check for new auth data
    const newAuth = localStorage.getItem("__admin_auth_v2");

    // Check cookies (client can read CSRF token but not HTTP-only auth cookies)
    const cookies = document.cookie.split(";").map((c) => c.trim().split("=")[0]);
    const hasAuthCookies = cookies.some((name) => ["refresh_token", "session_token"].includes(name));

    console.log("Old auth (v1):", !!oldAuth);
    console.log("Old password (v1):", !!oldPassword);
    console.log("New auth (v2):", !!newAuth);
    console.log("Auth cookies present:", hasAuthCookies);

    if (oldAuth || oldPassword) {
      console.log("🚨 OLD AUTH DATA DETECTED - Please clear and re-login!");
    }

    if (newAuth && hasAuthCookies) {
      console.log("✅ New secure auth system is working");
    } else {
      console.log("❌ Missing new auth data - Please log in with the new system");
    }
    console.log("=================================");
  }

  // Helper to clear old authentication data
  public clearOldAuthData(): void {
    if (typeof window === "undefined") return;

    console.log("Clearing old authentication data...");
    localStorage.removeItem("__admin_auth_v1");
    sessionStorage.removeItem("__admin_password_v1");
    sessionStorage.removeItem("__access_token_v2"); // Remove old token storage
    console.log("Old auth data cleared. Please refresh and log in again.");
  }

  private getAuthHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
    };
  }

  private getRequestOptions(options: RequestInit = {}): RequestInit {
    return {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
      credentials: "include", // Include cookies for authentication
    };
  }

  // Admin Authentication
  async loginAdmin(email: string, password: string): Promise<AdminUser | null> {
    try {
      // First verify credentials - cookies will be set automatically by the server
      const verifyResponse = await fetch(
        "/api/admins/verify",
        this.getRequestOptions({
          method: "POST",
          body: JSON.stringify({ email, password }),
        })
      );

      if (!verifyResponse.ok) {
        return null;
      }

      const { admin } = await verifyResponse.json();
      return admin;
    } catch (error) {
      console.error("Error logging in admin:", error);
      return null;
    }
  }

  async getAdminByEmail(email: string): Promise<AdminUser | null> {
    try {
      const response = await fetch(`/api/admins?email=${encodeURIComponent(email)}`, this.getRequestOptions());

      if (!response.ok) {
        return null;
      }

      const { admin } = await response.json();
      return admin;
    } catch (error) {
      console.error("Error getting admin by email:", error);
      return null;
    }
  }

  async verifyAdminToken(email: string, token: string): Promise<AdminUser | null> {
    try {
      const response = await fetch(
        "/api/admins/verify-token",
        this.getRequestOptions({
          method: "POST",
          body: JSON.stringify({ email, token }),
        })
      );

      if (!response.ok) {
        return null;
      }

      const { admin } = await response.json();
      return admin;
    } catch (error) {
      console.error("Error verifying admin token:", error);
      return null;
    }
  }

  // App Management
  async getApps(): Promise<App[]> {
    // Import the global cache functions dynamically to avoid circular imports
    const { getAppsCache, setAppsCache } = await import("@/components/admin/AppSelector");

    const now = Date.now();
    const cached = getAppsCache();

    // Check if we have fresh cached data
    if (cached && now - cached.timestamp < this.APPS_TTL) {
      return cached.apps;
    }

    // No cache or stale cache - fetch fresh data
    try {
      const response = await fetch("/api/apps", this.getRequestOptions());

      if (!response.ok) {
        console.error("Error fetching apps:", response.statusText);
        return cached?.apps || []; // Return cached data if available, even if stale
      }

      const data = await response.json();
      const apps = data.apps || [];

      // Update the global cache
      setAppsCache({ apps, timestamp: now });

      return apps;
    } catch (error) {
      console.error("Error fetching apps:", error);
      return cached?.apps || []; // Return cached data if available, even if stale
    }
  }

  async createApp(name: string, slug: string): Promise<App> {
    try {
      const response = await fetch("/api/apps", {
        ...this.getRequestOptions(),
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create app: ${response.statusText}`);
      }

      const data = await response.json();
      const newApp = data.app;

      // Update the global cache immediately
      const { addAppToCache } = await import("@/components/admin/AppSelector");
      addAppToCache(newApp);

      return newApp;
    } catch (error) {
      console.error("Error creating app:", error);
      throw error;
    }
  }

  async deleteApp(appId: string, deleteSharedUsers: boolean = false): Promise<void> {
    try {
      const queryParams = new URLSearchParams();
      if (deleteSharedUsers) {
        queryParams.append("deleteSharedUsers", "true");
      }

      const response = await fetch(`/api/apps/${appId}?${queryParams.toString()}`, {
        ...this.getRequestOptions(),
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete app: ${response.statusText}`);
      }

      // Update the global cache immediately
      const { removeAppFromCache } = await import("@/components/admin/AppSelector");
      removeAppFromCache(appId);
    } catch (error) {
      console.error("Error deleting app:", error);
      throw error;
    }
  }

  // Admin Management
  async getAllAdmins(): Promise<AdminUser[]> {
    const cacheKey = this.getCacheKey("getAllAdmins");

    return this.dedupedRequest(cacheKey, async () => {
      try {
        const response = await fetch("/api/admins", this.getRequestOptions());

        if (!response.ok) {
          console.error("Error fetching admins:", response.statusText);
          return [];
        }

        const data = await response.json();
        return data.admins || [];
      } catch (error) {
        console.error("Error fetching admins:", error);
        return [];
      }
    });
  }

  async createAdmin(adminData: { name: string; email: string; password?: string; image_url?: string }): Promise<AdminUser | null> {
    try {
      const response = await fetch("/api/admins", {
        method: "POST",
        ...this.getRequestOptions(),
        body: JSON.stringify(adminData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error creating admin:", errorData.error);
        return null;
      }

      const { admin } = await response.json();
      return admin;
    } catch (error) {
      console.error("Error creating admin:", error);
      return null;
    }
  }

  async removeAdmin(adminId: string): Promise<{ success: boolean; message: string; updatedUser?: AdminUser }> {
    try {
      const response = await fetch(`/api/admins/${adminId}`, {
        method: "PATCH",
        ...this.getRequestOptions(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          message: errorData.error || "Failed to remove admin",
        };
      }

      const data = await response.json();
      return {
        success: true,
        message: data.message,
        updatedUser: data.updatedUser,
      };
    } catch (error) {
      console.error("Error removing admin:", error);
      return {
        success: false,
        message: "Failed to remove admin",
      };
    }
  }

  // Features Management
  async getFeatures(params?: {
    email?: string;
    q?: string;
    sort?: "trending" | "top" | "new";
    filter?: "all" | "open" | "under_review" | "planned" | "in_progress" | "done" | "mine";
    limit?: number;
    page?: number;
    app_slug?: string;
  }): Promise<{
    items: FeatureRequest[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const cacheKey = this.getCacheKey("getFeatures", params);

    return this.dedupedRequest(cacheKey, async () => {
      try {
        const queryParams = new URLSearchParams();
        if (params?.email) queryParams.append("email", params.email);
        if (params?.q) queryParams.append("q", params.q);
        if (params?.sort) queryParams.append("sort", params.sort);
        if (params?.filter) queryParams.append("filter", params.filter);
        if (params?.limit) queryParams.append("limit", params.limit.toString());
        if (params?.page) queryParams.append("page", params.page.toString());
        if (params?.app_slug) queryParams.append("app_slug", params.app_slug);

        const response = await fetch(`/api/features?${queryParams.toString()}`, {
          ...this.getRequestOptions(),
        });

        if (!response.ok) {
          console.error("Error fetching features:", response.statusText);
          return { items: [], total: 0, page: 1, pageSize: 10, hasMore: false };
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error("Error fetching features:", error);
        return { items: [], total: 0, page: 1, pageSize: 10, hasMore: false };
      }
    });
  }

  async updateFeatureStatus(featureId: string, status: string): Promise<boolean> {
    try {
      const response = await fetch(
        `/api/features/${featureId}`,
        this.getRequestOptions({
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
      );

      return response.ok;
    } catch (error) {
      console.error("Error updating feature status:", error);
      return false;
    }
  }

  async deleteFeature(featureId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `/api/features/${featureId}`,
        this.getRequestOptions({
          method: "DELETE",
        })
      );

      return response.ok;
    } catch (error) {
      console.error("Error deleting feature:", error);
      return false;
    }
  }

  // Comment Management
  async deleteComment(featureId: string, commentId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `/api/features/${featureId}/comments/${commentId}`,
        this.getRequestOptions({
          method: "DELETE",
        })
      );

      return response.ok;
    } catch (error) {
      console.error("Error deleting comment:", error);
      return false;
    }
  }

  async editComment(featureId: string, commentId: string, content: string): Promise<boolean> {
    try {
      const response = await fetch(
        `/api/features/${featureId}/comments/${commentId}`,
        this.getRequestOptions({
          method: "PATCH",
          body: JSON.stringify({ content }),
        })
      );

      return response.ok;
    } catch (error) {
      console.error("Error editing comment:", error);
      return false;
    }
  }

  // Get features statistics (aggregated data from database)
  async getFeaturesStats(app_slug?: string): Promise<{
    totalFeatures: number;
    totalVotes: number;
    totalComments: number;
  }> {
    const cacheKey = this.getCacheKey("getFeaturesStats", { app_slug });

    return this.dedupedRequest(cacheKey, async () => {
      try {
        const queryParams = new URLSearchParams();
        queryParams.append("mode", "stats");
        if (app_slug) queryParams.append("app_slug", app_slug);

        const response = await fetch(`/api/features?${queryParams.toString()}`, {
          ...this.getRequestOptions(),
        });

        if (!response.ok) {
          console.error("Error fetching features stats:", response.statusText);
          return { totalFeatures: 0, totalVotes: 0, totalComments: 0 };
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error("Error fetching features stats:", error);
        return { totalFeatures: 0, totalVotes: 0, totalComments: 0 };
      }
    });
  }

  // Stats
  async getAdminStats(app_slug?: string): Promise<AdminStats> {
    const cacheKey = this.getCacheKey("getAdminStats", { app_slug });

    return this.dedupedRequest(
      cacheKey,
      async () => {
        try {
          const [featuresStats, admins] = await Promise.all([this.getFeaturesStats(app_slug), this.getAllAdmins()]);

          return {
            totalFeatures: featuresStats.totalFeatures,
            totalVotes: featuresStats.totalVotes,
            totalComments: featuresStats.totalComments,
            totalAdmins: admins.length,
          };
        } catch (error) {
          console.error("Error getting admin stats:", error);
          return {
            totalFeatures: 0,
            totalVotes: 0,
            totalComments: 0,
            totalAdmins: 0,
          };
        }
      },
      2 * 60 * 1000 // 2 minutes TTL for stats
    );
  }

  // Trends
  async getTrends(app_slug?: string): Promise<{
    trends: {
      total_features?: {
        current: number;
        previous: number;
        percentage: number;
        calculatedAt: string;
        periodStart: string;
        periodEnd: string;
      };
      total_votes?: {
        current: number;
        previous: number;
        percentage: number;
        calculatedAt: string;
        periodStart: string;
        periodEnd: string;
      };
      total_comments?: {
        current: number;
        previous: number;
        percentage: number;
        calculatedAt: string;
        periodStart: string;
        periodEnd: string;
      };
    };
    lastCalculated: string | null;
  }> {
    const cacheKey = this.getCacheKey("getTrends", { app_slug });

    return this.dedupedRequest(
      cacheKey,
      async () => {
        try {
          const queryParams = new URLSearchParams();
          if (app_slug) queryParams.append("app_slug", app_slug);

          const response = await fetch(`/api/trends?${queryParams.toString()}`, {
            ...this.getRequestOptions(),
          });

          if (!response.ok) {
            console.error("Error fetching trends:", response.statusText);
            return { trends: {}, lastCalculated: null };
          }

          const data = await response.json();
          return data;
        } catch (error) {
          console.error("Error fetching trends:", error);
          return { trends: {}, lastCalculated: null };
        }
      },
      2 * 60 * 1000 // 2 minutes TTL for trends (changes frequently)
    );
  }

  async triggerTrendCalculation(): Promise<boolean> {
    try {
      const response = await fetch("/api/trends", {
        method: "POST",
        ...this.getRequestOptions(),
      });

      return response.ok;
    } catch (error) {
      console.error("Error triggering trend calculation:", error);
      return false;
    }
  }
}

// Make the AdminApi class available globally for debugging
if (typeof window !== "undefined") {
  (window as any).adminApi = new AdminApi();
}

export const adminApi = new AdminApi();
