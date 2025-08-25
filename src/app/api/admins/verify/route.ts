import { type NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/utils/admin";
import { createTokenPair } from "@/lib/auth/jwt";
import { getClientIP, checkRateLimit, createRateLimitResponse, createAuthErrorResponse, addSecurityHeaders } from "@/lib/auth/middleware";
import { validateCSRFProtection } from "@/lib/auth/csrf";

export async function POST(req: NextRequest) {
  // Rate limiting
  const clientIP = getClientIP(req);
  if (!checkRateLimit(clientIP)) {
    return createRateLimitResponse(clientIP);
  }

  // CSRF protection (optional for login, but good practice)
  const csrfCookie = req.cookies.get("csrf-token")?.value;
  const csrfHeader = req.headers.get("x-csrf-token");

  // For now, make CSRF optional for login to maintain backward compatibility
  // In production, you might want to enforce it
  if (csrfCookie && !validateCSRFProtection(req, csrfCookie, csrfHeader || undefined)) {
    return createAuthErrorResponse("CSRF validation failed", 403);
  }

  let body: { email?: string; password?: string; rememberMe?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return createAuthErrorResponse("Invalid request body", 400);
  }

  const { email, password, rememberMe = false } = body;

  if (!email || !password) {
    return createAuthErrorResponse("Email and password are required", 400);
  }

  try {
    // Verify admin credentials using secure password verification
    const admin = await verifyAdminCredentials(email, password);

    if (!admin) {
      return createAuthErrorResponse("Invalid credentials", 401);
    }

    // Create JWT token pair
    const tokenPair = await createTokenPair(
      {
        sub: admin.id,
        email: admin.email,
        role: admin.role,
        name: admin.name,
      },
      rememberMe // Include session token if remember me is checked
    );

    const response = NextResponse.json({
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        image_url: admin.image_url,
        role: admin.role,
        created_at: admin.created_at,
        updated_at: admin.updated_at,
        isDefaultPassword: admin.isDefaultPassword,
      },
      tokens: {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        ...(tokenPair.sessionToken && { sessionToken: tokenPair.sessionToken }),
      },
    });

    // Set secure HTTP-only cookies for tokens
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const, // Lax for better compatibility while maintaining security
      path: "/",
      domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
    };

    response.cookies.set("refresh_token", tokenPair.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    if (tokenPair.sessionToken) {
      response.cookies.set("session_token", tokenPair.sessionToken, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    // Add security headers
    return addSecurityHeaders(response);
  } catch (error) {
    console.error("Error verifying admin credentials:", error);
    return createAuthErrorResponse("Authentication failed", 500);
  }
}
