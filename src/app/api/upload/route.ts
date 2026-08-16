import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { uploadFile, getUploadLimits } from "@/lib/storage";

// In-memory user upload rate limiter (max 30 uploads per minute)
const uploadTracker = new Map<string, { count: number; resetTime: number }>();
const MAX_UPLOADS_PER_MINUTE = 30;

function checkUploadRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = uploadTracker.get(userId);
  if (!record || now > record.resetTime) {
    uploadTracker.set(userId, { count: 1, resetTime: now + 60_000 });
    return true;
  }
  if (record.count >= MAX_UPLOADS_PER_MINUTE) {
    return false;
  }
  record.count++;
  return true;
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.status === "suspended") {
      return NextResponse.json({ error: "User is suspended" }, { status: 403 });
    }

    if (!checkUploadRateLimit(user.id)) {
      return NextResponse.json({ error: "上传过于频繁，请稍后再试" }, { status: 429 });
    }

    const limits = await getUploadLimits();
    const maxBytes = limits.maxFileSizeMB * 1024 * 1024;

    // Early Content-Length check to reject oversized payloads before parsing form data in memory
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxBytes + 10 * 1024 * 1024) {
      return NextResponse.json({ error: `File size exceeds maximum allowed size of ${limits.maxFileSizeMB}MB` }, { status: 413 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > maxBytes) {
      return NextResponse.json({ error: `File size exceeds maximum allowed size of ${limits.maxFileSizeMB}MB` }, { status: 413 });
    }

    const { searchParams } = new URL(req.url);
    const biz = searchParams.get("biz") as "profile" | "moment" | null;

    // Buffer the raw file then hand it to sharp — the most reliable path across
    // browser/environment stream implementations.
    const result = await uploadFile(Buffer.from(await file.arrayBuffer()), file.name, file.type, biz || undefined);

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Upload handler error:", error);
    // Return a short, non-sensitive error message (no stack, no secrets) so
    // failures can be diagnosed from the client during debugging.
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "文件上传失败，请重试", detail }, { status: 500 });
  }
}
