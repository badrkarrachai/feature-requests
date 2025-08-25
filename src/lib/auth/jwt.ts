import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";

// Get JWT secret from environment or generate a random one for development
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(64).toString("hex");
const JWT_SECRET_KEY = new TextEncoder().encode(JWT_SECRET);

// Token expiration times
const ACCESS_TOKEN_EXPIRATION = "15m"; // 15 minutes
const REFRESH_TOKEN_EXPIRATION = "7d"; // 7 days
const SESSION_TOKEN_EXPIRATION = "30d"; // 30 days for remember me

export interface JWTPayload {
  sub: string; // user ID
  email: string;
  role: "admin" | "user";
  name: string;
  type: "access" | "refresh" | "session";
  iat?: number;
  exp?: number;
  jti?: string; // JWT ID for token blacklisting
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  sessionToken?: string;
}

/**
 * Generate a secure random JWT ID
 */
function generateJTI(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Create access token (short-lived)
 */
export async function createAccessToken(payload: Omit<JWTPayload, "type" | "jti">): Promise<string> {
  return await new SignJWT({
    ...payload,
    type: "access",
    jti: generateJTI(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRATION)
    .setIssuer("feature-requests-app")
    .setAudience("feature-requests-admin")
    .sign(JWT_SECRET_KEY);
}

/**
 * Create refresh token (long-lived)
 */
export async function createRefreshToken(payload: Omit<JWTPayload, "type" | "jti">): Promise<string> {
  return await new SignJWT({
    ...payload,
    type: "refresh",
    jti: generateJTI(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRATION)
    .setIssuer("feature-requests-app")
    .setAudience("feature-requests-admin")
    .sign(JWT_SECRET_KEY);
}

/**
 * Create session token (medium-lived, for remember me)
 */
export async function createSessionToken(payload: Omit<JWTPayload, "type" | "jti">): Promise<string> {
  return await new SignJWT({
    ...payload,
    type: "session",
    jti: generateJTI(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TOKEN_EXPIRATION)
    .setIssuer("feature-requests-app")
    .setAudience("feature-requests-admin")
    .sign(JWT_SECRET_KEY);
}

/**
 * Create a complete token pair for authentication
 */
export async function createTokenPair(userPayload: Omit<JWTPayload, "type" | "jti">, includeSession = false): Promise<TokenPair> {
  const [accessToken, refreshToken, sessionToken] = await Promise.all([
    createAccessToken(userPayload),
    createRefreshToken(userPayload),
    includeSession ? createSessionToken(userPayload) : Promise.resolve(undefined),
  ]);

  return {
    accessToken,
    refreshToken,
    sessionToken,
  };
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY, {
      issuer: "feature-requests-app",
      audience: "feature-requests-admin",
    });

    return payload as unknown as JWTPayload;
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Validate token type for specific operations
 */
export function validateTokenType(payload: JWTPayload, expectedType: JWTPayload["type"]): boolean {
  return payload.type === expectedType;
}

/**
 * Check if token is expired (with buffer for clock skew)
 */
export function isTokenExpired(payload: JWTPayload, bufferSeconds = 30): boolean {
  if (!payload.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now + bufferSeconds;
}

/**
 * Get remaining token lifetime in seconds
 */
export function getTokenLifetime(payload: JWTPayload): number {
  if (!payload.exp) return 0;
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, payload.exp - now);
}

// In production, you should implement a token blacklist/revocation system
// This is a simple in-memory implementation for development
const revokedTokens = new Set<string>();

/**
 * Revoke a token (add to blacklist)
 */
export function revokeToken(jti: string): void {
  if (jti) {
    revokedTokens.add(jti);
  }
}

/**
 * Check if token is revoked
 */
export function isTokenRevoked(jti: string): boolean {
  return revokedTokens.has(jti);
}

/**
 * Clean up expired revoked tokens (should be called periodically)
 */
export function cleanupRevokedTokens(): void {
  // In a real implementation, you'd query your database to remove expired tokens
  // For now, we'll clear the set periodically (not ideal for production)
  const oneDay = 24 * 60 * 60 * 1000;
  setInterval(() => {
    revokedTokens.clear();
  }, oneDay);
}
