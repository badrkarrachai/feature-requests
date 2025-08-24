import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Get the email from the current request's authorization header
 * Note: This uses a simplified auth system for demo purposes
 * In production, you should use proper JWT authentication
 */
export async function getRequesterEmail(): Promise<string | null> {
  try {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    if (!authHeader) {
      return null;
    }

    // Extract base64 encoded user data from Bearer header
    const encodedData = authHeader.replace("Bearer ", "");

    try {
      const decodedData = JSON.parse(atob(encodedData));
      return decodedData.email || null;
    } catch {
      return null;
    }
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
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

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
 * Uses the users table with role = 'admin'
 */
export async function isRequesterAdmin(): Promise<boolean> {
  try {
    const email = await getRequesterEmail();
    if (!email) {
      return false;
    }

    // Query users table for admin role
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .eq("role", "admin")
      .single();

    if (error || !user) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * Get admin user details using custom auth system
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  try {
    const email = await getRequesterEmail();
    if (!email) {
      return null;
    }

    const { data: admin, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("role", "admin")
      .single();

    if (error || !admin) {
      return null;
    }

    return admin as AdminUser;
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
      .select("*")
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
export async function addAdmin(
  email: string,
  name: string,
  imageUrl?: string,
  password?: string,
): Promise<AdminUser | null> {
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
    const { data: admin, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

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
 * Verify admin credentials using the verify_admin_return_id RPC function
 */
export async function verifyAdminCredentials(
  email: string,
  password: string,
): Promise<string | null> {
  try {
    const { data: userId, error } = await supabaseAdmin.rpc(
      "verify_admin_return_id",
      {
        p_email: email.toLowerCase(),
        p_password: password,
      },
    );

    if (error || !userId) {
      console.error("Error verifying admin credentials:", error);
      return null;
    }

    return userId;
  } catch (error) {
    console.error("Error verifying admin credentials:", error);
    return null;
  }
}
