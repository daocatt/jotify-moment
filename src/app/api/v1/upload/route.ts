import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { uploadFile, getUploadLimits } from "@/lib/storage";

// In-memory upload rate limiter
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
    const auth = await authenticateApiRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Invalid or missing API token" }, { status: 401 });
    }

    const { user, token } = auth;

    if (token && !token.scopes.includes("upload:write")) {
      return NextResponse.json({ error: "Forbidden: API token lacks upload:write scope" }, { status: 403 });
    }

    if (user.status === "suspended") {
      return NextResponse.json({ error: "User is suspended" }, { status: 403 });
    }

    if (!checkUploadRateLimit(user.id)) {
      return NextResponse.json({ error: "上传过于频繁，请稍后再试 (Rate limit exceeded)" }, { status: 429 });
    }

    const limits = await getUploadLimits();
    const maxBytes = limits.maxFileSizeMB * 1024 * 1024;

    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxBytes + 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size of ${limits.maxFileSizeMB}MB` },
        { status: 413 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided in form-data" }, { status: 400 });
    }

    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size of ${limits.maxFileSizeMB}MB` },
        { status: 413 }
      );
    }

    const { searchParams } = new URL(req.url);
    const biz = (searchParams.get("biz") as "profile" | "moment" | null) || "moment";

    const rawBytes = new Uint8Array(await file.arrayBuffer());
    const cleanBytes = new Uint8Array(rawBytes.byteLength);
    cleanBytes.set(rawBytes);
    const fileBuffer = Buffer.from(cleanBytes.buffer);

    const result = await uploadFile(fileBuffer, file.name, file.type, biz);

    return NextResponse.json({
      success: true,
      media: {
        type: result.type,
        url: result.url,
        name: result.name,
        size: file.size,
      },
    });
  } catch (error: unknown) {
    console.error("[API v1 Upload] Error:", error);
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "文件上传失败", detail }, { status: 500 });
  }
}
