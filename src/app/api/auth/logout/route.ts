import { type NextRequest, NextResponse } from "next/server";
import { verifyToken, revokeToken } from "@/lib/auth/jwt";
import { addSecurityHeaders, createAuthErrorResponse } from "@/lib/auth/middleware";

export async function POST(req: NextRequest) {
  try {
    // Get tokens from cookies and headers
    const refreshToken = req.cookies.get("refresh_token")?.value;
    const sessionToken = req.cookies.get("session_token")?.value;
    const authHeader = req.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    // Revoke all tokens
    const tokensToRevoke = [refreshToken, sessionToken, accessToken].filter(Boolean);

    for (const token of tokensToRevoke) {
      if (token) {
        const payload = await verifyToken(token);
        if (payload?.jti) {
          revokeToken(payload.jti);
        }
      }
    }

    const response = NextResponse.json({
      success: true,
      message: "Successfully logged out",
    });

    // Clear all authentication cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const, // Match login cookie settings
      path: "/",
      domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
      maxAge: 0, // Expire immediately
    };

    response.cookies.set("refresh_token", "", cookieOptions);
    response.cookies.set("session_token", "", cookieOptions);
    response.cookies.set("csrf-token", "", cookieOptions);

    return addSecurityHeaders(response);
  } catch (error) {
    console.error("Error during logout:", error);
    return createAuthErrorResponse("Logout failed", 500);
  }
}
