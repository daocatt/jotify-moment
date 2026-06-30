import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { uploadFile, getUploadLimits } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.status === "suspended") {
      return NextResponse.json({ error: "User is suspended" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const limits = await getUploadLimits();
    const maxBytes = limits.maxFileSizeMB * 1024 * 1024;

    if (file.size > maxBytes) {
      return NextResponse.json({ error: `File size exceeds maximum allowed size of ${limits.maxFileSizeMB}MB` }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const result = await uploadFile(buffer, file.name, file.type);
    
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Upload handler error:", error);
    const message = error instanceof Error ? error.message : "Failed to upload file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
