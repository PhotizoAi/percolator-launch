import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getClientIp, createRateLimiter } from "@/lib/route-utils";

export const dynamic = 'force-dynamic';

const isRateLimited = createRateLimiter(5);

function sanitize(str: string): string {
  return str.replace(/[<>]/g, "").trim();
}

const TABLE = "ideas";

export async function GET() {
  try {
    const sb = getServiceClient();
    const { data, error } = await (sb.from as any)(TABLE)
      .select("id, handle, idea, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      // Table might not exist yet
      if (error.code === "42P01") return NextResponse.json([]);
      throw error;
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("GET /api/ideas error:", err);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Rate limited — max 5 ideas per hour" },
        { status: 429 }
      );
    }

    const body = await req.json();
    const handle = sanitize(String(body.handle ?? ""));
    const idea = sanitize(String(body.idea ?? ""));
    const contact = body.contact ? sanitize(String(body.contact)) : null;

    if (!handle || handle.length > 30) {
      return NextResponse.json(
        { error: "Handle required (max 30 chars)" },
        { status: 400 }
      );
    }
    if (!idea || idea.length > 500) {
      return NextResponse.json(
        { error: "Idea required (max 500 chars)" },
        { status: 400 }
      );
    }

    const sb = getServiceClient();
    const { error } = await (sb.from as any)(TABLE)
      .insert({ handle, idea, contact, ip });

    if (error) throw error;

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("POST /api/ideas error:", err);
    return NextResponse.json(
      { error: "Failed to submit idea" },
      { status: 500 }
    );
  }
}
