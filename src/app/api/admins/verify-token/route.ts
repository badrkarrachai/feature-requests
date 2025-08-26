import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export async function POST(req: NextRequest) {
  let body: { email?: string; token?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const { email, token } = body as {
    email?: string;
    token?: string;
  };

  if (!email || !token) {
    return NextResponse.json(
      { error: "email and token are required" },
      { status: 400 },
    );
  }

  try {
    // Decode the token to verify it
    let decodedData;
    try {
      decodedData = JSON.parse(atob(token));
    } catch {
      return NextResponse.json(
        { error: "Invalid token format" },
        { status: 401 },
      );
    }

    // Check if token email matches provided email
    if (decodedData.email !== email) {
      return NextResponse.json(
        { error: "Token email mismatch" },
        { status: 401 },
      );
    }

    // Check if token is not too old (24 hours)
    const tokenAge = Date.now() - (decodedData.timestamp || 0);
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }

    // Get admin user details
    const { data: admin, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("role", "admin")
      .single();

    if (error || !admin) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    return NextResponse.json({
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        image_url: admin.image_url,
        created_at: admin.created_at,
        updated_at: admin.updated_at,
      },
    });
  } catch (error) {
    console.error("Error verifying admin token:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
