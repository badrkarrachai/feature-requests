// API: PATCH individual admin (change role from admin to user)
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";
import { requireAdmin, addSecurityHeaders, createAuthErrorResponse } from "@/lib/auth/middleware";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const adminId = resolvedParams.id;

  if (!adminId) {
    return NextResponse.json({ error: "Admin ID is required" }, { status: 400 });
  }

  // Check if requester is admin
  const authResult = await requireAdmin(req);
  if (!authResult.success) {
    return createAuthErrorResponse(authResult.error || "Admin access required", 403);
  }

  try {
    // Check if the admin exists
    const { data: adminToUpdate, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("id, name, email")
      .eq("id", adminId)
      .eq("role", "admin")
      .single();

    if (fetchError || !adminToUpdate) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    // Check how many admins exist
    const { data: allAdmins, error: countError } = await supabaseAdmin.from("users").select("id").eq("role", "admin");

    if (countError) {
      console.error("Error counting admins:", countError);
      return NextResponse.json({ error: "Failed to verify admin count" }, { status: 500 });
    }

    // Prevent removing the last admin
    if (allAdmins && allAdmins.length <= 1) {
      return NextResponse.json({ error: "Cannot remove the last remaining admin" }, { status: 400 });
    }

    // Update the admin's role to user
    const { error: updateError } = await supabaseAdmin.from("users").update({ role: "user" }).eq("id", adminId).eq("role", "admin");

    if (updateError) {
      console.error("Error updating admin role:", updateError);
      return NextResponse.json({ error: "Failed to remove admin privileges" }, { status: 500 });
    }

    return addSecurityHeaders(
      NextResponse.json({
        message: `Admin ${adminToUpdate.name} has been successfully demoted to user`,
        updatedUser: {
          id: adminToUpdate.id,
          name: adminToUpdate.name,
          email: adminToUpdate.email,
          role: "user",
        },
      })
    );
  } catch (error) {
    console.error("Error updating admin role:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
