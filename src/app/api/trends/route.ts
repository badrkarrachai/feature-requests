import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    // Get latest trends from database using the new function
    const { data: trends, error } = await supabaseAdmin.rpc("get_latest_trends");

    if (error) {
      console.error("Error fetching trends:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform the data into a more UI-friendly format
    const trendsMap =
      trends?.reduce((acc: any, trend: any) => {
        acc[trend.metric_name] = {
          current: trend.current_value,
          previous: trend.previous_value,
          percentage: trend.trend_percent,
          calculatedAt: trend.computed_at,
          periodStart: trend.period_start,
          periodEnd: trend.period_end,
        };
        return acc;
      }, {}) || {};

    return NextResponse.json({
      trends: trendsMap,
      lastCalculated: trends?.[0]?.computed_at || null,
    });
  } catch (error) {
    console.error("Error in trends API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST endpoint to manually trigger trend calculation (admin only)
export async function POST(req: NextRequest) {
  try {
    // Check if this is an admin request
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }

    // Trigger trend calculation using the new function
    const { error } = await supabaseAdmin.rpc("refresh_trends");

    if (error) {
      console.error("Error calculating trends:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get the updated trends
    const { data: trends, error: fetchError } = await supabaseAdmin.rpc("get_latest_trends");

    if (fetchError) {
      console.error("Error fetching updated trends:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Transform the data
    const trendsMap =
      trends?.reduce((acc: any, trend: any) => {
        acc[trend.metric_name] = {
          current: trend.current_value,
          previous: trend.previous_value,
          percentage: trend.trend_percent,
          calculatedAt: trend.computed_at,
          periodStart: trend.period_start,
          periodEnd: trend.period_end,
        };
        return acc;
      }, {}) || {};

    return NextResponse.json({
      message: "Trends calculated successfully",
      trends: trendsMap,
      lastCalculated: trends?.[0]?.computed_at || null,
    });
  } catch (error) {
    console.error("Error in manual trend calculation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
