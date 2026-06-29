import { NextResponse } from "next/server";
import { db } from "@/db";
import { posts, users } from "@/db/schema";
import { uploadFile } from "@/lib/storage";
import { eq, desc } from "drizzle-orm";

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const ALLOWED_IDS = process.env.TELEGRAM_ALLOWED_USER_IDS
  ? process.env.TELEGRAM_ALLOWED_USER_IDS.split(",").map(id => id.trim())
  : [];

interface TelegramUpdate {
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    caption?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      file_size: number;
      width: number;
      height: number;
    }>;
    voice?: {
      file_id: string;
      file_unique_id: string;
      duration: number;
      mime_type: string;
      file_size: number;
    };
    video?: {
      file_id: string;
      file_unique_id: string;
      duration: number;
      mime_type: string;
      file_size: number;
    };
  };
}

async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  if (!TG_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const fileInfoResponse = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getFile?file_id=${fileId}`);
  const fileInfo = await fileInfoResponse.json();

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    throw new Error("Failed to get file info from Telegram");
  }

  const filePath = fileInfo.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${TG_TOKEN}/${filePath}`;

  const fileResponse = await fetch(fileUrl);
  const arrayBuffer = await fileResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const filename = filePath.split("/").pop() || "telegram_file";
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  let mimeType = "application/octet-stream";
  if (["jpg", "jpeg"].includes(ext)) mimeType = "image/jpeg";
  else if (ext === "png") mimeType = "image/png";
  else if (ext === "gif") mimeType = "image/gif";
  else if (ext === "webp") mimeType = "image/webp";
  else if (ext === "mp3") mimeType = "audio/mpeg";
  else if (ext === "ogg") mimeType = "audio/ogg";
  else if (ext === "wav") mimeType = "audio/wav";
  else if (ext === "mp4") mimeType = "video/mp4";
  else if (ext === "webm") {
    mimeType = filePath.includes("voice") ? "audio/webm" : "video/webm";
  }

  return { buffer, name: filename, mimeType };
}

export async function POST(req: Request) {
  try {
    if (!TG_TOKEN) {
      return NextResponse.json({ error: "Telegram Bot Token is not configured" }, { status: 500 });
    }

    if (TG_SECRET) {
      const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secretHeader !== TG_SECRET) {
        return NextResponse.json({ error: "Invalid secret token" }, { status: 403 });
      }
    }

    const body = (await req.json()) as TelegramUpdate;
    const message = body.message;

    if (!message) {
      return NextResponse.json({ message: "No message payload" });
    }

    if (message.from.is_bot) {
      return NextResponse.json({ message: "Bot messages are not allowed" });
    }

    const userId = message.from.id.toString();

    if (ALLOWED_IDS.length > 0 && !ALLOWED_IDS.includes(userId)) {
      console.warn(`Unauthorized Telegram access attempt from ID: ${userId}`);
      return NextResponse.json({ error: "Unauthorized user" }, { status: 403 });
    }

    const botAuthorId = process.env.TELEGRAM_BOT_AUTHOR_ID;
    let authorUser: { id: string } | null | undefined = null;

    if (botAuthorId) {
      authorUser = await db.query.users.findFirst({
        where: eq(users.id, botAuthorId),
        columns: { id: true },
      });
    }

    if (!authorUser) {
      authorUser = await db.query.users.findFirst({
        where: (u, { eq, or }) => or(eq(u.role, "super_admin"), eq(u.role, "admin")),
        orderBy: [desc(users.createdAt)],
        columns: { id: true },
      });
    }

    if (!authorUser) {
      return NextResponse.json({ error: "No admin user found to assign the post" }, { status: 500 });
    }

    const content = message.text || message.caption || "";
    const mediaUrls: Array<{ type: string; url: string; name: string; duration?: number }> = [];

    if (message.photo && message.photo.length > 0) {
      const largestPhoto = message.photo.reduce((prev, current) => {
        return prev.file_size > current.file_size ? prev : current;
      });
      const { buffer, name, mimeType } = await downloadTelegramFile(largestPhoto.file_id);
      const uploadRes = await uploadFile(buffer, name, mimeType);
      mediaUrls.push({
        type: "image",
        url: uploadRes.url,
        name: uploadRes.name,
      });
    }

    if (message.voice) {
      const { buffer, name, mimeType } = await downloadTelegramFile(message.voice.file_id);
      const audioMimeType = mimeType.startsWith("audio/") ? mimeType : "audio/webm";
      const uploadRes = await uploadFile(buffer, name, audioMimeType);
      mediaUrls.push({
        type: "audio",
        url: uploadRes.url,
        name: uploadRes.name,
        duration: message.voice.duration,
      });
    }

    if (message.video) {
      const { buffer, name, mimeType } = await downloadTelegramFile(message.video.file_id);
      const videoMimeType = mimeType.startsWith("video/") ? mimeType : "video/mp4";
      const uploadRes = await uploadFile(buffer, name, videoMimeType);
      mediaUrls.push({
        type: "video",
        url: uploadRes.url,
        name: uploadRes.name,
        duration: message.video.duration,
      });
    }

    let ytVideoId: string | null = null;
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const ytMatch = content.match(ytRegex);
    if (ytMatch) {
      ytVideoId = ytMatch[1];
    }

    const requireApprovalRow = await db.query.settings.findFirst({
      where: (s, { eq }) => eq(s.key, "require_approval"),
    });
    const requireApproval = requireApprovalRow?.value === "true";
    const postStatus = requireApproval ? "pending" : "approved";

    if (content || mediaUrls.length > 0) {
      await db.insert(posts).values({
        userId: authorUser.id,
        content: content || "Published via Telegram Bot",
        mediaUrls,
        ytVideoId,
        status: postStatus,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Telegram webhook error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
