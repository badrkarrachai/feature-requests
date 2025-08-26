import type { AdminStats, AdminUser, FeatureRequest } from "@/types/admin";

class AdminApi {
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

  // Admin Management
  async getAllAdmins(): Promise<AdminUser[]> {
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
  }): Promise<{
    items: FeatureRequest[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.email) queryParams.append("email", params.email);
      if (params?.q) queryParams.append("q", params.q);
      if (params?.sort) queryParams.append("sort", params.sort);
      if (params?.filter) queryParams.append("filter", params.filter);
      if (params?.limit) queryParams.append("limit", params.limit.toString());
      if (params?.page) queryParams.append("page", params.page.toString());

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

  // Stats
  async getAdminStats(): Promise<AdminStats> {
    try {
      const [featuresData, admins] = await Promise.all([this.getFeatures({ limit: 1000 }), this.getAllAdmins()]);

      const features = featuresData.items;

      return {
        totalFeatures: features.length,
        totalVotes: features.reduce((sum, f) => sum + f.votes_count, 0),
        totalComments: features.reduce((sum, f) => sum + f.comments_count, 0),
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
  }

  // Trends
  async getTrends(): Promise<{
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
    try {
      const response = await fetch("/api/trends", {
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
