import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/utils/admin";

export const runtime = "nodejs";

// GET /api/auth/me - returns authenticated user from JWT (if any)
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ user: null });
    }
    // Only return non-sensitive fields
    const { id, name, email, image_url, role, created_at, updated_at } = user;
    return NextResponse.json({ user: { id, name, email, image_url, role, created_at, updated_at } });
  } catch (e) {
    return NextResponse.json({ user: null });
  }
}

