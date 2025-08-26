// API: GET list admins / POST create admin
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { addAdmin, getAllAdmins } from "@/lib/utils/admin";
import { requireAdmin, addSecurityHeaders, createAuthErrorResponse } from "@/lib/auth/middleware";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");

  // If email is provided, check if that specific email is an admin (for auth purposes)
  if (email) {
    const { data: admin, error } = await supabaseAdmin
      .from("users")
      .select("id, name, email, image_url, created_at, updated_at")
      .eq("email", email.toLowerCase())
      .eq("role", "admin")
      .single();

    if (error || !admin) {
      return NextResponse.json({ admin: null });
    }

    return NextResponse.json({ admin });
  }

  // If no email provided, get all admins (requires authentication)
  const admins = await getAllAdmins();

  // If no admins exist, allow anyone to see the empty list (for first-time setup)
  if (admins.length === 0) {
    return addSecurityHeaders(NextResponse.json({ admins: [] }));
  }

  // Check if requester is admin (only if admins exist)
  const authResult = await requireAdmin(req);
  if (!authResult.success) {
    return createAuthErrorResponse(authResult.error || "Admin access required", 403);
  }

  return addSecurityHeaders(NextResponse.json({ admins }));
}

export async function POST(req: NextRequest) {
  let body: {
    email?: string;
    name?: string;
    password?: string;
    image_url?: string;
  } = {};
  try {
    body = await req.json();
  } catch {}

  const { email, name, password, image_url } = body as {
    email?: string;
    name?: string;
    password?: string;
    image_url?: string;
  };

  if (!email || !name) {
    return NextResponse.json(
      { error: "email and name are required" },
      { status: 400 },
    );
  }

  // Special case: if there are no admins yet, allow anyone to create the first admin
  const existingAdmins = await getAllAdmins();

  if (existingAdmins.length > 0) {
    // If admins exist, check if requester is admin
    const authResult = await requireAdmin(req);
    if (!authResult.success) {
      return createAuthErrorResponse(authResult.error || "Admin access required", 403);
    }
  } else {
    // First admin being created - allow it
    console.log("Creating first admin:", email);
  }

  const newAdmin = await addAdmin(email, name, image_url, password);
  if (!newAdmin) {
    return createAuthErrorResponse("Failed to add admin", 500);
  }

  return addSecurityHeaders(NextResponse.json({ admin: newAdmin }));
}
