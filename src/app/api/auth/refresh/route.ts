import { type NextRequest, NextResponse } from "next/server";
import { verifyToken, createTokenPair, validateTokenType, isTokenRevoked } from "@/lib/auth/jwt";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { 
  getClientIP, 
  checkRateLimit, 
  createRateLimitResponse, 
  createAuthErrorResponse,
  addSecurityHeaders 
} from "@/lib/auth/middleware";

export async function POST(req: NextRequest) {
  // Rate limiting
  const clientIP = getClientIP(req);
  if (!checkRateLimit(clientIP)) {
    return createRateLimitResponse();
  }

  try {
    // Get refresh token from cookie or body
    let refreshToken = req.cookies.get('refresh_token')?.value;
    
    if (!refreshToken) {
      const body = await req.json().catch(() => ({}));
      refreshToken = body.refreshToken;
    }

    if (!refreshToken) {
      return createAuthErrorResponse("Refresh token required", 401);
    }

    // Verify refresh token
    const payload = await verifyToken(refreshToken);
    if (!payload) {
      return createAuthErrorResponse("Invalid refresh token", 401);
    }

    // Validate token type
    if (!validateTokenType(payload, 'refresh')) {
      return createAuthErrorResponse("Invalid token type", 401);
    }

    // Check if token is revoked
    if (payload.jti && isTokenRevoked(payload.jti)) {
      return createAuthErrorResponse("Token has been revoked", 401);
    }

    // Verify user still exists and is active
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("id, name, email, image_url, role, created_at, updated_at")
      .eq("id", payload.sub)
      .eq("role", "admin")
      .single();

    if (error || !user) {
      return createAuthErrorResponse("User not found or not authorized", 401);
    }

    // Create new token pair
    const newTokenPair = await createTokenPair({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    const response = NextResponse.json({
      admin: {
        id: user.id,
        name: user.name,
        email: user.email,
        image_url: user.image_url,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      tokens: {
        accessToken: newTokenPair.accessToken,
        refreshToken: newTokenPair.refreshToken,
      },
    });

    // Update refresh token cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    response.cookies.set('refresh_token', newTokenPair.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error("Error refreshing token:", error);
    return createAuthErrorResponse("Token refresh failed", 500);
  }
}
