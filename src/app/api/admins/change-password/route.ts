import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { verifyPassword, hashPassword, validatePassword } from "@/lib/auth/password";
import { getClientIP, checkRateLimit, createRateLimitResponse, createAuthErrorResponse, addSecurityHeaders } from "@/lib/auth/middleware";

export async function POST(req: NextRequest) {
  // Rate limiting
  const clientIP = getClientIP(req);
  if (!checkRateLimit(clientIP)) {
    return createRateLimitResponse();
  }

  let body: {
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  } = {};

  try {
    body = await req.json();
  } catch {
    return createAuthErrorResponse("Invalid request body", 400);
  }

  const { email, currentPassword, newPassword } = body;

  if (!email || !currentPassword || !newPassword) {
    return createAuthErrorResponse("Email, current password, and new password are required", 400);
  }

  try {
    // Get admin user from database
    const { data: admin, error } = await supabaseAdmin
      .from("users")
      .select("id, email, password_hash, created_at")
      .eq("email", email.toLowerCase())
      .eq("role", "admin")
      .single();

    if (error || !admin) {
      // Perform dummy verification to prevent timing attacks
      await verifyPassword(currentPassword, "$2b$12$dummyhashtopreventtimingattacks1234567890");
      return createAuthErrorResponse("Invalid credentials", 401);
    }

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(currentPassword, admin.password_hash);
    if (!isCurrentPasswordValid) {
      return createAuthErrorResponse("Current password is incorrect", 401);
    }

    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return createAuthErrorResponse(`Password validation failed: ${passwordValidation.errors.join(", ")}`, 400);
    }

    // Check if new password is different from current
    const isSamePassword = await verifyPassword(newPassword, admin.password_hash);
    if (isSamePassword) {
      return createAuthErrorResponse("New password must be different from current password", 400);
    }

    // Hash the new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update the password in database using the secure RPC function
    const { error: updateError } = await supabaseAdmin.rpc("admin_change_password", {
      p_admin_email: email.toLowerCase(),
      p_old_password: currentPassword,
      p_new_password: newPassword,
    });

    if (updateError) {
      console.error("Error updating password:", updateError);
      return createAuthErrorResponse("Failed to update password", 500);
    }

    const response = NextResponse.json({
      success: true,
      message: "Password changed successfully",
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error("Error changing password:", error);
    return createAuthErrorResponse("Internal server error", 500);
  }
}
