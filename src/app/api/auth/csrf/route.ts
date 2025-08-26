import { NextResponse } from "next/server";
import { generateCSRFToken } from "@/lib/auth/csrf";
import { addSecurityHeaders } from "@/lib/auth/middleware";

export async function GET() {
  try {
    const csrfToken = generateCSRFToken();

    const response = NextResponse.json({
      csrfToken,
      timestamp: new Date().toISOString(),
    });

    // Set CSRF token as a cookie (not HTTP-only so client can read it)
    const cookieOptions = {
      httpOnly: false, // Client needs to read this for header inclusion
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60, // 1 hour
      domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
    };

    response.cookies.set("csrf-token", csrfToken, cookieOptions);

    return addSecurityHeaders(response);
  } catch (error) {
    console.error("Error generating CSRF token:", error);
    return NextResponse.json({ error: "Failed to generate CSRF token" }, { status: 500 });
  }
}
