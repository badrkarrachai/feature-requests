import { randomBytes, createHmac, timingSafeEqual } from "crypto";

const CSRF_SECRET = process.env.CSRF_SECRET || "your-csrf-secret-key-change-in-production";
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate a CSRF token
 */
export function generateCSRFToken(): string {
  const token = randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", CSRF_SECRET).update(`${token}-${timestamp}`).digest("hex");

  return `${token}-${timestamp}-${signature}`;
}

/**
 * Validate a CSRF token
 */
export function validateCSRFToken(token: string, maxAge: number = 60 * 60 * 1000): boolean {
  try {
    const parts = token.split("-");
    if (parts.length !== 3) {
      return false;
    }

    const [tokenPart, timestampPart, signature] = parts;
    const timestamp = parseInt(timestampPart, 10);

    // Check if token is expired
    if (Date.now() - timestamp > maxAge) {
      return false;
    }

    // Verify signature
    const expectedSignature = createHmac("sha256", CSRF_SECRET).update(`${tokenPart}-${timestampPart}`).digest("hex");

    // Use timing-safe comparison
    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedSignatureBuffer = Buffer.from(expectedSignature, "hex");

    if (signatureBuffer.length !== expectedSignatureBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedSignatureBuffer);
  } catch (error) {
    console.error("CSRF validation error:", error);
    return false;
  }
}

/**
 * Get CSRF token from request headers or cookies
 */
export function getCSRFTokenFromRequest(request: Request): string | null {
  // Try header first
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken) {
    return headerToken;
  }

  // Try form data for POST requests
  if (request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
    // This would need to be handled by the calling code since we can't read body here
    return null;
  }

  return null;
}

/**
 * Validate CSRF protection for state-changing operations
 */
export function validateCSRFProtection(request: Request, cookieToken?: string, headerToken?: string): boolean {
  // Only require CSRF for state-changing operations
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return true; // GET, HEAD, OPTIONS don't need CSRF protection
  }

  const token = headerToken || getCSRFTokenFromRequest(request);

  if (!token || !cookieToken) {
    return false;
  }

  // Tokens must match and be valid
  return token === cookieToken && validateCSRFToken(token);
}
