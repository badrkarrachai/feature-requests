import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { authenticateServerRequest, type AuthResult } from "@/lib/auth/middleware";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
  role: "admin" | "user";
}

/**
 * Get the authenticated user from JWT token
 */
export async function getAuthenticatedUser(): Promise<AdminUser | null> {
  try {
    const authResult = await authenticateServerRequest();

    if (!authResult.success || !authResult.user) {
      return null;
    }

    // Fetch fresh user data from database
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, name, email, image_url, role, created_at, updated_at")
      .eq("id", authResult.user.sub)
      .single();

    if (error || !user) {
      return null;
    }

    return user as AdminUser;
  } catch (error) {
    console.error("Error getting authenticated user:", error);
    return null;
  }
}

/**
 * Get the email from the current request's authorization header
 * @deprecated Use getAuthenticatedUser() instead for better security
 */
export async function getRequesterEmail(): Promise<string | null> {
  try {
    const user = await getAuthenticatedUser();
    return user?.email || null;
  } catch (error) {
    console.error("Error getting requester email:", error);
    return null;
  }
}

/**
 * Get user ID by email from the users table
 */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  try {
    const { data: user, error } = await supabaseAdmin.from("users").select("id").eq("email", email.toLowerCase()).single();

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch (error) {
    console.error("Error getting user ID by email:", error);
    return null;
  }
}

/**
 * Check if the current requester is an admin
 * Uses JWT token authentication
 */
export async function isRequesterAdmin(): Promise<boolean> {
  try {
    const authResult = await authenticateServerRequest();

    if (!authResult.success || !authResult.user) {
      return false;
    }

    return authResult.user.role === "admin";
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * Get admin user details using JWT authentication
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  try {
    const user = await getAuthenticatedUser();

    if (!user || user.role !== "admin") {
      return null;
    }

    return user;
  } catch (error) {
    console.error("Error getting admin user:", error);
    return null;
  }
}

/**
 * Get all admins from users table
 */
export async function getAllAdmins(): Promise<AdminUser[]> {
  try {
    const { data: admins, error } = await supabaseAdmin
      .from("users")
      .select("id, name, email, image_url, role, created_at, updated_at")
      .eq("role", "admin")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error getting admins:", error);
      return [];
    }

    return (admins || []) as AdminUser[];
  } catch (error) {
    console.error("Error getting admins:", error);
    return [];
  }
}

/**
 * Add a new admin using the admin_upsert RPC function
 */
export async function addAdmin(email: string, name: string, imageUrl?: string, password?: string): Promise<AdminUser | null> {
  try {
    // Use the admin_upsert RPC function from the database
    const { data: userId, error } = await supabaseAdmin.rpc("admin_upsert", {
      p_email: email.toLowerCase(),
      p_name: name.trim().toLowerCase(),
      p_image_url: imageUrl || null,
      p_password: password || "defaultpassword123", // Default password, should be changed
    });

    if (error) {
      console.error("Error adding admin:", error);
      return null;
    }

    // Get the created admin user
    const { data: admin, error: fetchError } = await supabaseAdmin.from("users").select("*").eq("id", userId).single();

    if (fetchError || !admin) {
      console.error("Error fetching created admin:", fetchError);
      return null;
    }

    return admin as AdminUser;
  } catch (error) {
    console.error("Error adding admin:", error);
    return null;
  }
}

/**
 * Verify admin credentials securely with rate limiting protection
 */
export async function verifyAdminCredentials(email: string, password: string): Promise<(AdminUser & { isDefaultPassword?: boolean }) | null> {
  try {
    // Use the database's built-in verification function which uses the same crypt() function
    // that was used to hash the password
    const { data: adminId, error } = await supabaseAdmin.rpc("verify_admin_return_id", {
      p_email: email,
      p_password: password,
    });

    if (error) {
      console.error("Admin verification error:", error);
      return null;
    }

    if (!adminId) {
      return null;
    }

    // Get the admin user details
    const { data: admin, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("id, name, email, image_url, role, created_at, updated_at")
      .eq("id", adminId)
      .eq("role", "admin")
      .single();

    if (fetchError || !admin) {
      console.error("Error fetching admin details:", fetchError);
      return null;
    }

    // Check if this is the default admin account with default password
    const isDefaultAccount = admin.email === "admin@admin.com";
    const isDefaultPassword = isDefaultAccount && password === "admin";

    return {
      ...(admin as AdminUser),
      isDefaultPassword,
    };
  } catch (error) {
    console.error("Error verifying admin credentials:", error);
    return null;
  }
}
