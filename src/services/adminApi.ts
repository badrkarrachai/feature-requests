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
    console.log("sessionStorage keys:", Object.keys(sessionStorage));

    const storedAuth = localStorage.getItem("__admin_auth_v1");
    if (storedAuth) {
      try {
        const admin = JSON.parse(storedAuth);
        console.log("Admin data in localStorage:", admin);
      } catch (error) {
        console.error("Error parsing admin data:", error);
      }
    } else {
      console.log("No admin data in localStorage");
    }

    const storedPassword = sessionStorage.getItem("__admin_password_v1");
    if (storedPassword) {
      console.log("Password found in sessionStorage (length:", storedPassword.length, ")");
    } else {
      console.log("No password in sessionStorage - THIS IS THE ISSUE!");
      console.log("You need to login again to store the password in sessionStorage");
    }
    console.log("=================================");
  }

  private getAuthHeaders(): HeadersInit {
    if (typeof window === "undefined") {
      return {
        "Content-Type": "application/json",
      };
    }

    const storedAuth = localStorage.getItem("__admin_auth_v1");
    if (storedAuth) {
      try {
        const admin = JSON.parse(storedAuth) as { email: string };
        // Create the token format expected by the backend
        const token = btoa(JSON.stringify({ email: admin.email }));
        return {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };
      } catch {
        // Invalid stored auth, continue without headers
        console.error("Invalid admin auth data in localStorage");
      }
    }
    return {
      "Content-Type": "application/json",
    };
  }

  // Admin Authentication
  async loginAdmin(email: string, password: string): Promise<AdminUser | null> {
    try {
      // First verify credentials
      const verifyResponse = await fetch("/api/admins/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

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
      const response = await fetch(`/api/admins?email=${encodeURIComponent(email)}`);

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
      const response = await fetch("/api/admins/verify-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, token }),
      });

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
      const response = await fetch("/api/admins", {
        headers: this.getAuthHeaders(),
      });

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
        headers: this.getAuthHeaders(),
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
        headers: this.getAuthHeaders(),
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

  async updateFeatureStatus(featureId: string, status: string, adminCredentials?: { email: string; password: string }): Promise<boolean> {
    try {
      // Get admin credentials from localStorage if not provided
      let credentials = adminCredentials;
      if (!credentials) {
        const storedAuth = localStorage.getItem("__admin_auth_v1");
        if (storedAuth) {
          try {
            const admin = JSON.parse(storedAuth) as { email: string };
            // For now, we'll need to get the password from sessionStorage
            // This is a temporary solution until the API is properly refactored
            const storedPassword = sessionStorage.getItem("__admin_password_v1");
            if (storedPassword) {
              credentials = { email: admin.email, password: storedPassword };
            }
          } catch {
            console.error("Error getting admin credentials from storage");
            return false;
          }
        }
      }

      if (!credentials) {
        console.error("Admin credentials not available. Please ensure you are logged in as an admin.");
        console.log("localStorage keys:", typeof window !== "undefined" ? Object.keys(localStorage) : "N/A");
        console.log("sessionStorage keys:", typeof window !== "undefined" ? Object.keys(sessionStorage) : "N/A");
        return false;
      }

      const response = await fetch(`/api/features/${featureId}`, {
        method: "PATCH",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          status,
          admin_email: credentials.email,
          admin_password: credentials.password,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("Error updating feature status:", error);
      return false;
    }
  }

  async deleteFeature(featureId: string, adminCredentials?: { email: string; password: string }): Promise<boolean> {
    try {
      // Get admin credentials from localStorage if not provided
      let credentials = adminCredentials;
      if (!credentials) {
        // Check if we're in browser environment
        if (typeof window === "undefined") {
          console.error("Cannot access localStorage in server environment");
          return false;
        }

        const storedAuth = localStorage.getItem("__admin_auth_v1");
        if (storedAuth) {
          try {
            const admin = JSON.parse(storedAuth) as { email: string };
            // For now, we'll need to get the password from sessionStorage
            // This is a temporary solution until the API is properly refactored
            const storedPassword = sessionStorage.getItem("__admin_password_v1");
            if (storedPassword) {
              credentials = { email: admin.email, password: storedPassword };
              console.log("Found credentials for admin:", admin.email);
            } else {
              console.error("Admin password not found in sessionStorage");
            }
          } catch (error) {
            console.error("Error parsing admin data from localStorage:", error);
            return false;
          }
        } else {
          console.error("Admin authentication data not found in localStorage");
        }
      }

      if (!credentials) {
        console.error("Admin credentials not available. Please ensure you are logged in as an admin.");
        console.log("localStorage keys:", typeof window !== "undefined" ? Object.keys(localStorage) : "N/A");
        console.log("sessionStorage keys:", typeof window !== "undefined" ? Object.keys(sessionStorage) : "N/A");
        return false;
      }

      const response = await fetch(`/api/features/${featureId}`, {
        method: "DELETE",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          admin_email: credentials.email,
          admin_password: credentials.password,
        }),
      });

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
}

// Make the AdminApi class available globally for debugging
if (typeof window !== "undefined") {
  (window as any).adminApi = new AdminApi();
}

export const adminApi = new AdminApi();
