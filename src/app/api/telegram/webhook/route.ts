import { NextResponse } from "next/server";
import { db } from "@/db";
import { posts, users, settings } from "@/db/schema";
import { uploadFile } from "@/lib/storage";
import { eq, desc } from "drizzle-orm";
import { generateUniquePostId } from "@/app/actions/posts";

async function downloadTelegramFile(botToken: string, fileId: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  const fileInfoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  const fileInfo = await fileInfoResponse.json();

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    throw new Error("Failed to get file info from Telegram");
  }

  const filePath = fileInfo.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

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
    // 1. Fetch config settings from the database
    const botTokenSetting = await db.query.settings.findFirst({ where: eq(settings.key, "telegram_bot_token") });
    const webhookSecretSetting = await db.query.settings.findFirst({ where: eq(settings.key, "telegram_webhook_secret") });

    if (!botTokenSetting?.value) {
      return NextResponse.json({ error: "Telegram Bot is not configured in settings" }, { status: 500 });
    }

    const botToken = botTokenSetting.value;

    // 2. Validate webhook secret token if it is set in db settings
    if (webhookSecretSetting?.value) {
      const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secretHeader !== webhookSecretSetting.value) {
        return NextResponse.json({ error: "Invalid secret token" }, { status: 403 });
      }
    }

    const body = await req.json();
    const message = body.message;

    if (!message) {
      return NextResponse.json({ message: "No message payload" });
    }

    if (message.from.is_bot) {
      return NextResponse.json({ message: "Bot messages are not allowed" });
    }

    const chatId = message.chat.id.toString();

    // 3. Handle Start parameter binding command
    if (message.text && message.text.startsWith("/start ")) {
      const token = message.text.split(" ")[1]?.trim();
      if (token) {
        const targetUser = await db.query.users.findFirst({
          where: eq(users.telegramBindToken, token),
        });

        if (targetUser) {
          // Bind the user
          await db.update(users).set({
            telegramChatId: chatId,
            telegram: message.from.username || message.from.first_name,
            telegramBindToken: null,
          }).where(eq(users.id, targetUser.id));

          // Reply binding success via Telegram sendMessage API
          const replyUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
          await fetch(replyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: message.chat.id,
              text: `🎉 绑定成功！\n现在你可以向我发送文字、图片、语音或视频，它们将自动发布到你的 Moment 朋友圈中。`
            })
          }).catch(e => console.error("Reply binding error:", e));

          return NextResponse.json({ ok: true });
        } else {
          // Reply token invalid
          const replyUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
          await fetch(replyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: message.chat.id,
              text: `❌ 绑定失败：未找到该绑定 Token，或该 Token 已失效。`
            })
          }).catch(e => console.error("Reply invalid token error:", e));

          return NextResponse.json({ ok: true });
        }
      }
    }

    // 4. Check if the sender is bound
    const authorUser = await db.query.users.findFirst({
      where: eq(users.telegramChatId, chatId),
      columns: { id: true, role: true },
    });

    if (!authorUser) {
      // Send message instructing user to bind
      const replyUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetch(replyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: `⚠️ 你还没有绑定 Moment 账户。\n请去 Moment 个人主页，在资料编辑面板的 “Telegram” 菜单中进行一键绑定。`
        })
      }).catch(e => console.error("Reply bind instruction error:", e));

      return NextResponse.json({ error: "Sender not bound" }, { status: 403 });
    }

    // 5. Download media and compile moment content
    const content = message.text || message.caption || "";
    const mediaUrls: Array<{ type: string; url: string; name: string; duration?: number }> = [];

    if (message.photo && message.photo.length > 0) {
      const largestPhoto = message.photo.reduce((prev: any, current: any) => {
        return prev.file_size > current.file_size ? prev : current;
      });
      const { buffer, name, mimeType } = await downloadTelegramFile(botToken, largestPhoto.file_id);
      const uploadRes = await uploadFile(buffer, name, mimeType);
      mediaUrls.push({
        type: "image",
        url: uploadRes.url,
        name: uploadRes.name,
      });
    }

    if (message.voice) {
      const { buffer, name, mimeType } = await downloadTelegramFile(botToken, message.voice.file_id);
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
      const { buffer, name, mimeType } = await downloadTelegramFile(botToken, message.video.file_id);
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
    
    // Non-admin users are subjected to require_approval checks
    const isAdminUser = authorUser.role === "super_admin" || authorUser.role === "admin";
    const postStatus = (requireApproval && !isAdminUser) ? "pending" : "approved";

    if (content || mediaUrls.length > 0) {
      const postId = await generateUniquePostId();
      await db.insert(posts).values({
        id: postId,
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
