import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifyToken, extractTokenFromHeader, validateTokenType, isTokenRevoked, type JWTPayload } from "./jwt";

export interface AuthResult {
  success: boolean;
  user?: JWTPayload;
  error?: string;
}

/**
 * Rate limiting for authentication endpoints
 * Progressive rate limiting with environment-aware configuration
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number; lastAttempt: number }>();

// Environment-aware rate limiting configuration
const getRateLimitConfig = () => {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const isTest = process.env.NODE_ENV === "test";

  return {
    // More lenient in development/testing
    maxAttempts: isTest ? 100 : isDevelopment ? 20 : 5,
    windowMs: isTest ? 60000 : isDevelopment ? 300000 : 900000, // 1min test, 5min dev, 15min prod
    lockoutMs: isTest ? 30000 : isDevelopment ? 60000 : 900000, // 30s test, 1min dev, 15min prod
  };
};

const RATE_LIMIT_CONFIG = getRateLimitConfig();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const config = RATE_LIMIT_CONFIG;
  const userLimit = rateLimitMap.get(ip);

  if (!userLimit) {
    rateLimitMap.set(ip, {
      count: 1,
      resetTime: now + config.windowMs,
      lastAttempt: now,
    });
    return true;
  }

  // Check if we're in a lockout period (after max attempts exceeded)
  if (userLimit.count >= config.maxAttempts) {
    if (now < userLimit.resetTime) {
      return false; // Still locked out
    } else {
      // Lockout period expired, reset counter
      rateLimitMap.set(ip, {
        count: 1,
        resetTime: now + config.windowMs,
        lastAttempt: now,
      });
      return true;
    }
  }

  // Within window but under limit, increment counter
  if (now <= userLimit.resetTime) {
    userLimit.count++;
    userLimit.lastAttempt = now;

    // Check if we've just exceeded the limit
    if (userLimit.count >= config.maxAttempts) {
      // Set lockout period
      userLimit.resetTime = now + config.lockoutMs;
      return false;
    }

    return true;
  }

  // Window expired, reset counter
  rateLimitMap.set(ip, {
    count: 1,
    resetTime: now + config.windowMs,
    lastAttempt: now,
  });
  return true;
}

/**
 * Get client IP address from request
 */
export function getClientIP(request: NextRequest): string {
  // Check various headers for the real IP
  const forwarded = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");
  const cfIP = request.headers.get("cf-connecting-ip");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  if (cfIP) {
    return cfIP;
  }

  // Fallback to request IP (NextRequest doesn't have ip property in newer versions)
  return "unknown";
}

/**
 * Validate CSRF token
 */
export function validateCSRF(request: NextRequest): boolean {
  // For state-changing operations, check CSRF token
  if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
    const csrfToken = request.headers.get("x-csrf-token");
    const csrfCookie = request.cookies.get("csrf-token")?.value;

    if (!csrfToken || !csrfCookie || csrfToken !== csrfCookie) {
      return false;
    }
  }

  return true;
}

/**
 * Extract and verify JWT token from request cookies or headers (fallback)
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  try {
    // Try to get token from cookies first (preferred method)
    let token = request.cookies.get("refresh_token")?.value || request.cookies.get("session_token")?.value;

    // Fallback to Authorization header for backward compatibility
    if (!token) {
      const authHeader = request.headers.get("authorization");
      token = extractTokenFromHeader(authHeader) || undefined;
    }

    if (!token) {
      return { success: false, error: "No authentication token provided" };
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return { success: false, error: "Invalid authentication token" };
    }

    // Check if token is revoked
    if (payload.jti && isTokenRevoked(payload.jti)) {
      return { success: false, error: "Token has been revoked" };
    }

    return { success: true, user: payload };
  } catch (error) {
    console.error("Authentication error:", error);
    return { success: false, error: "Authentication failed" };
  }
}

/**
 * Server-side authentication helper using Next.js headers and cookies
 */
export async function authenticateServerRequest(): Promise<AuthResult> {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();

    // Try to get token from cookies first (preferred method)
    let token = cookieStore.get("refresh_token")?.value || cookieStore.get("session_token")?.value;

    // Fallback to Authorization header for backward compatibility
    if (!token) {
      const headersList = await headers();
      const authHeader = headersList.get("authorization");
      token = extractTokenFromHeader(authHeader) || undefined;
    }

    if (!token) {
      return { success: false, error: "No authentication token provided" };
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return { success: false, error: "Invalid authentication token" };
    }

    // Check if token is revoked
    if (payload.jti && isTokenRevoked(payload.jti)) {
      return { success: false, error: "Token has been revoked" };
    }

    return { success: true, user: payload };
  } catch (error) {
    console.error("Server authentication error:", error);
    return { success: false, error: "Authentication failed" };
  }
}

/**
 * Require admin authentication
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const authResult = await authenticateRequest(request);

  if (!authResult.success) {
    return authResult;
  }

  if (authResult.user?.role !== "admin") {
    return { success: false, error: "Admin access required" };
  }

  return authResult;
}

/**
 * Require access token (not refresh token)
 */
export async function requireAccessToken(request: NextRequest): Promise<AuthResult> {
  const authResult = await authenticateRequest(request);

  if (!authResult.success) {
    return authResult;
  }

  if (!validateTokenType(authResult.user!, "access")) {
    return { success: false, error: "Access token required" };
  }

  return authResult;
}

/**
 * Create standardized error responses
 */
export function createAuthErrorResponse(error: string, status: number = 401): NextResponse {
  return NextResponse.json(
    { error, timestamp: new Date().toISOString() },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    }
  );
}

/**
 * Get rate limit status for an IP
 */
export function getRateLimitStatus(ip: string): { remaining: number; resetTime: number; isLocked: boolean } {
  const userLimit = rateLimitMap.get(ip);
  const config = RATE_LIMIT_CONFIG;

  if (!userLimit) {
    return { remaining: config.maxAttempts, resetTime: 0, isLocked: false };
  }

  const now = Date.now();

  if (userLimit.count >= config.maxAttempts && now < userLimit.resetTime) {
    return {
      remaining: 0,
      resetTime: userLimit.resetTime,
      isLocked: true,
    };
  }

  if (now > userLimit.resetTime) {
    return { remaining: config.maxAttempts, resetTime: 0, isLocked: false };
  }

  return {
    remaining: Math.max(0, config.maxAttempts - userLimit.count),
    resetTime: userLimit.resetTime,
    isLocked: false,
  };
}

/**
 * Create standardized rate limit error response
 */
export function createRateLimitResponse(ip?: string): NextResponse {
  const config = RATE_LIMIT_CONFIG;
  const status = ip ? getRateLimitStatus(ip) : { remaining: 0, resetTime: Date.now() + config.lockoutMs, isLocked: true };
  const retryAfter = Math.ceil((status.resetTime - Date.now()) / 1000);

  return NextResponse.json(
    {
      error: "Too many authentication attempts. Please try again later.",
      retryAfter,
      remainingAttempts: status.remaining,
      resetTime: new Date(status.resetTime).toISOString(),
      maxAttempts: config.maxAttempts,
    },
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfter.toString(),
        "X-RateLimit-Limit": config.maxAttempts.toString(),
        "X-RateLimit-Remaining": status.remaining.toString(),
        "X-RateLimit-Reset": Math.floor(status.resetTime / 1000).toString(),
      },
    }
  );
}

/**
 * Security headers for all responses
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Only add HSTS in production with HTTPS
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return response;
}
