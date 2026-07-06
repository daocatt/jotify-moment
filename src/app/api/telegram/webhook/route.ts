import { NextResponse } from "next/server";
import { db } from "@/db";
import { posts, users, settings } from "@/db/schema";
import { uploadFile } from "@/lib/storage";
import { eq } from "drizzle-orm";
import { generateUniquePostId } from "@/app/actions/posts";

const MEDIA_GROUP_WINDOW_MS = 2000;
const MAX_MEDIA_GROUP_CACHE = 500;

const mediaGroupCache = new Map<string, {
  messages: any[];
  timer: ReturnType<typeof setTimeout>;
}>();

function trimMediaGroupCache() {
  if (mediaGroupCache.size <= MAX_MEDIA_GROUP_CACHE) return;
  const keys = [...mediaGroupCache.keys()];
  for (let i = 0; i < keys.length - MAX_MEDIA_GROUP_CACHE; i++) {
    const entry = mediaGroupCache.get(keys[i]);
    if (entry) {
      clearTimeout(entry.timer);
      mediaGroupCache.delete(keys[i]);
    }
  }
}

const HELP_TEXT = `📖 Moment Bot 使用指南

🔹 发帖：直接发送文字、图片、语音、视频（或组合发送）
🔹 绑定：在 Moment 个人主页的资料编辑中生成绑定 Token，然后发送 /start <token>
🔹 个人信息：/me
🔹 帮助：/help

📌 多张图片请作为相册发送，会合并到一条动态中
📌 管理员发帖直接通过，普通用户可能需要审核`;

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch((e) => console.error("Telegram reply error:", e));
}

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
  else if (ext === "m4a") mimeType = "audio/m4a";
  else if (ext === "mp4") mimeType = "video/mp4";
  else if (ext === "webm") {
    mimeType = filePath.includes("voice") || filePath.includes("audio") ? "audio/webm" : "video/webm";
  }

  if (mimeType === "application/octet-stream") {
    if (filePath.includes("voice") || ext === "ogg") mimeType = "audio/ogg";
    else if (filePath.includes("audio") || ["mp3", "m4a", "wav", "flac"].includes(ext)) mimeType = "audio/mpeg";
    else if (filePath.includes("photo")) mimeType = "image/jpeg";
    else if (filePath.includes("video") || ext === "mp4") mimeType = "video/mp4";
  }

  return { buffer, name: filename, mimeType };
}

export async function POST(req: Request) {
  try {
    const botTokenSetting = await db.query.settings.findFirst({ where: eq(settings.key, "telegram_bot_token") });
    const webhookSecretSetting = await db.query.settings.findFirst({ where: eq(settings.key, "telegram_webhook_secret") });

    if (!botTokenSetting?.value) {
      return NextResponse.json({ error: "Telegram Bot is not configured" }, { status: 500 });
    }

    const botToken = botTokenSetting.value;

    if (!webhookSecretSetting?.value) {
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 403 });
    }

    const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretHeader !== webhookSecretSetting.value) {
      return NextResponse.json({ error: "Invalid secret token" }, { status: 403 });
    }

    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > 1_024_000) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const body = await req.json();
    const message = body.message;

    if (!message) {
      return NextResponse.json({ message: "No message payload" });
    }

    if (message.from.is_bot) {
      return NextResponse.json({ message: "Bot messages are not allowed" });
    }

    const chatId = message.chat.id;
    const chatIdStr = chatId.toString();

    // Handle /start <token> - bind account (private chat only)
    if (message.text && message.text.startsWith("/start")) {
      if (message.chat.type !== "private") {
        return NextResponse.json({ ok: true });
      }

      const parts = message.text.trim().split(" ");
      const token = parts[1]?.trim();

      if (token) {
        const targetUser = await db.query.users.findFirst({
          where: eq(users.telegramBindToken, token),
        });

        if (targetUser) {
          await db.update(users).set({
            telegramChatId: chatIdStr,
            telegram: message.from.username || message.from.first_name,
            telegramBindToken: null,
          }).where(eq(users.id, targetUser.id));

          await sendTelegramMessage(botToken, chatId, `🎉 绑定成功！\n现在你可以向我发送文字、图片、语音或视频，它们将自动发布到你的 Moment 中。\n\n发送 /help 查看使用指南。`);
          return NextResponse.json({ ok: true });
        } else {
          await sendTelegramMessage(botToken, chatId, `❌ 绑定失败：未找到该绑定 Token，或该 Token 已失效。\n请在 Moment 个人主页重新生成绑定 Token。`);
          return NextResponse.json({ ok: true });
        }
      } else {
        const authorUser = await db.query.users.findFirst({
          where: eq(users.telegramChatId, chatIdStr),
          columns: { id: true },
        });

        if (authorUser) {
          await sendTelegramMessage(botToken, chatId, `✅ 你已经绑定了 Moment 账户。\n\n${HELP_TEXT}`);
        } else {
          await sendTelegramMessage(botToken, chatId, `👋 欢迎使用 Moment Bot！\n\n你还没有绑定 Moment 账户，请先在 Moment 个人主页的资料编辑中生成绑定 Token，然后发送：\n/start <你的绑定Token>\n\n${HELP_TEXT}`);
        }
        return NextResponse.json({ ok: true });
      }
    }

    // Handle /help command (private chat only)
    if (message.text && message.text.trim() === "/help") {
      if (message.chat.type === "private") {
        await sendTelegramMessage(botToken, chatId, HELP_TEXT);
      }
      return NextResponse.json({ ok: true });
    }

    // Handle /me command (private chat only)
    if (message.text && message.text.trim() === "/me") {
      if (message.chat.type !== "private") {
        return NextResponse.json({ ok: true });
      }

      const authorUser = await db.query.users.findFirst({
        where: eq(users.telegramChatId, chatIdStr),
      });

      if (!authorUser) {
        await sendTelegramMessage(
          botToken,
          chatId,
          `⚠️ 你还没有绑定 Moment 账户。\n请先在 Moment 个人主页生成绑定 Token，然后发送 /start <token>`
        );
        return NextResponse.json({ ok: true });
      }

      const regTime = new Date(authorUser.createdAt).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });

      const roleMap: Record<string, string> = {
        super_admin: "超级管理员 (super_admin)",
        admin: "管理员 (admin)",
        user: "普通用户 (user)",
        guest: "访客 (guest)",
      };

      const roleStr = roleMap[authorUser.role] || authorUser.role;
      const statusStr = authorUser.status === "active" ? "正常" : "被封禁/挂起";

      const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
      const homePageUrl = authorUser.slug ? `${baseUrl}/u/${authorUser.slug}` : `${baseUrl}`;

      const maskedEmail = authorUser.email.replace(/^(.{1,2})(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(b.length) + c);

      const replyText = `👤 你的个人注册信息：\n\n` +
        `昵称：${authorUser.name}\n` +
        `邮箱：${maskedEmail}\n` +
        `角色：${roleStr}\n` +
        `状态：${statusStr}\n` +
        `注册时间：${regTime}\n\n` +
        `🏠 个人主页地址：\n${homePageUrl}`;

      await sendTelegramMessage(botToken, chatId, replyText);
      return NextResponse.json({ ok: true });
    }

    // Handle unknown commands (any message starting with /)
    if (message.text && message.text.startsWith("/")) {
      if (message.chat.type === "private") {
        await sendTelegramMessage(botToken, chatId, `❌ 未知命令。发送 /help 查看可用命令。`);
      }
      return NextResponse.json({ ok: true });
    }

    // Only process post creation in private chat
    if (message.chat.type !== "private") {
      return NextResponse.json({ ok: true });
    }

    // Check if sender is bound
    const authorUser = await db.query.users.findFirst({
      where: eq(users.telegramChatId, chatIdStr),
      columns: { id: true, role: true },
    });

    if (!authorUser) {
      if (message.chat.type === "private") {
        await sendTelegramMessage(botToken, chatId, `⚠️ 你还没有绑定 Moment 账户。\n请先在 Moment 个人主页生成绑定 Token，然后发送 /start <token>`);
      }
      return NextResponse.json({ error: "Sender not bound" }, { status: 403 });
    }

    // Handle media_group (album) - buffer messages and merge
    if (message.media_group_id) {
      const groupId = message.media_group_id;
      const cached = mediaGroupCache.get(groupId);

      if (cached) {
        cached.messages.push(message);
      } else {
        trimMediaGroupCache();
        mediaGroupCache.set(groupId, {
          messages: [message],
          timer: setTimeout(() => processMediaGroup(botToken, groupId, authorUser), MEDIA_GROUP_WINDOW_MS),
        });
      }

      return NextResponse.json({ ok: true });
    }

    // Single message post (no media_group)
    const result = await processSingleMessage(botToken, message, authorUser);
    return result;
  } catch (error: unknown) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function processMediaGroup(botToken: string, groupId: string, authorUser: { id: string; role: string }) {
  const cached = mediaGroupCache.get(groupId);
  if (!cached) return;
  mediaGroupCache.delete(groupId);

  const messages = cached.messages;
  const chatId = messages[0].chat.id;
  const mediaUrls: Array<{ type: string; url: string; name: string; duration?: number; thumbnailUrl?: string }> = [];

  let content = "";
  for (const msg of messages) {
    if (msg.caption && !content) content = msg.caption;
  }

  for (const msg of messages) {
    if (msg.photo && msg.photo.length > 0) {
      const largestPhoto = msg.photo.reduce((prev: any, current: any) => prev.file_size > current.file_size ? prev : current);
      const { buffer, name, mimeType } = await downloadTelegramFile(botToken, largestPhoto.file_id);
      const uploadRes = await uploadFile(buffer, name, mimeType);
      mediaUrls.push({ type: "image", url: uploadRes.url, name: uploadRes.name, thumbnailUrl: uploadRes.thumbnailUrl });
    }
    if (msg.video) {
      const { buffer, name, mimeType } = await downloadTelegramFile(botToken, msg.video.file_id);
      const videoMimeType = mimeType.startsWith("video/") ? mimeType : "video/mp4";
      const uploadRes = await uploadFile(buffer, name, videoMimeType);
      mediaUrls.push({ type: "video", url: uploadRes.url, name: uploadRes.name, duration: msg.video.duration });
    }
  }

  if (!content && mediaUrls.length === 0) return;

  const requireApprovalRow = await db.query.settings.findFirst({
    where: (s, { eq }) => eq(s.key, "require_approval"),
  });
  const requireApproval = requireApprovalRow?.value === "true";
  const isAdminUser = authorUser.role === "super_admin" || authorUser.role === "admin";
  const postStatus = (requireApproval && !isAdminUser) ? "pending" : "approved";

  const postId = await generateUniquePostId();
  await db.insert(posts).values({
    id: postId,
    userId: authorUser.id,
    content: content || "",
    mediaUrls,
    status: postStatus,
  });

  if (postStatus === "pending") {
    await sendTelegramMessage(botToken, chatId, `📝 相册动态已提交（${mediaUrls.length} 张图片），等待管理员审核。`);
  } else {
    await sendTelegramMessage(botToken, chatId, `✅ 相册动态已发布（${mediaUrls.length} 张图片）！`);
  }
}

async function processSingleMessage(botToken: string, message: any, authorUser: { id: string; role: string }): Promise<NextResponse> {
  try {
    const chatId = message.chat.id;
    const content = message.text || message.caption || "";
    const mediaUrls: Array<{ type: string; url: string; name: string; duration?: number; thumbnailUrl?: string }> = [];

    if (message.photo && message.photo.length > 0) {
      const largestPhoto = message.photo.reduce((prev: any, current: any) => prev.file_size > current.file_size ? prev : current);
      const { buffer, name, mimeType } = await downloadTelegramFile(botToken, largestPhoto.file_id);
      const uploadRes = await uploadFile(buffer, name, mimeType);
      mediaUrls.push({ type: "image", url: uploadRes.url, name: uploadRes.name, thumbnailUrl: uploadRes.thumbnailUrl });
    }

    if (message.voice) {
      const { buffer, name, mimeType } = await downloadTelegramFile(botToken, message.voice.file_id);
      const audioMimeType = mimeType.startsWith("audio/") ? mimeType : "audio/ogg";
      const uploadRes = await uploadFile(buffer, name, audioMimeType);
      mediaUrls.push({ type: "audio", url: uploadRes.url, name: uploadRes.name, duration: message.voice.duration });
    }

    if (message.audio) {
      const { buffer, name, mimeType } = await downloadTelegramFile(botToken, message.audio.file_id);
      const audioExt = name.split(".").pop()?.toLowerCase() || "";
      const audioMimeType = mimeType.startsWith("audio/") ? mimeType
        : ["ogg"].includes(audioExt) ? "audio/ogg"
        : ["mp3"].includes(audioExt) ? "audio/mpeg"
        : ["wav"].includes(audioExt) ? "audio/wav"
        : ["m4a"].includes(audioExt) ? "audio/mp4"
        : "audio/mpeg";
      const uploadRes = await uploadFile(buffer, name, audioMimeType);
      mediaUrls.push({ type: "audio", url: uploadRes.url, name: uploadRes.name, duration: message.audio.duration });
    }

    if (message.video) {
      const { buffer, name, mimeType } = await downloadTelegramFile(botToken, message.video.file_id);
      const videoExt = name.split(".").pop()?.toLowerCase() || "";
      const videoMimeType = mimeType.startsWith("video/") ? mimeType
        : videoExt === "webm" ? "video/webm"
        : "video/mp4";
      const uploadRes = await uploadFile(buffer, name, videoMimeType);
      mediaUrls.push({ type: "video", url: uploadRes.url, name: uploadRes.name, duration: message.video.duration });
    }

    if (message.video_note) {
      const { buffer, name, mimeType } = await downloadTelegramFile(botToken, message.video_note.file_id);
      const videoExt = name.split(".").pop()?.toLowerCase() || "";
      const videoMimeType = mimeType.startsWith("video/") ? mimeType
        : videoExt === "webm" ? "video/webm"
        : "video/mp4";
      const uploadRes = await uploadFile(buffer, name, videoMimeType);
      mediaUrls.push({ type: "video", url: uploadRes.url, name: uploadRes.name, duration: message.video_note.duration });
    }

    if (message.document && !message.photo) {
      const mime = message.document.mime_type || "";
      const fileName = message.document.file_name || "";
      const ext = fileName.split(".").pop()?.toLowerCase() || "";

      const isImage = mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
      const isVideo = mime.startsWith("video/") || ["mp4", "webm"].includes(ext);
      const isAudio = mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "flac"].includes(ext);

      if (isImage || isVideo || isAudio) {
        const { buffer, name, mimeType } = await downloadTelegramFile(botToken, message.document.file_id);
        const uploadRes = await uploadFile(buffer, name, mimeType);
        const type = isImage ? "image" : isVideo ? "video" : "audio";
        mediaUrls.push({ type, url: uploadRes.url, name: uploadRes.name, thumbnailUrl: uploadRes.thumbnailUrl });
      }
    }

    let ytVideoId: string | null = null;
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const ytMatch = content.match(ytRegex);
    if (ytMatch) {
      ytVideoId = ytMatch[1];
    }

    if (!content && mediaUrls.length === 0 && !ytVideoId) {
      await sendTelegramMessage(botToken, chatId, `💡 请发送文字、图片、语音或视频来发布动态。\n发送 /help 查看使用指南。`);
      return NextResponse.json({ ok: true });
    }

    const requireApprovalRow = await db.query.settings.findFirst({
      where: (s, { eq }) => eq(s.key, "require_approval"),
    });
    const requireApproval = requireApprovalRow?.value === "true";
    const isAdminUser = authorUser.role === "super_admin" || authorUser.role === "admin";
    const postStatus = (requireApproval && !isAdminUser) ? "pending" : "approved";

    const postId = await generateUniquePostId();
    await db.insert(posts).values({
      id: postId,
      userId: authorUser.id,
      content: content || "",
      mediaUrls,
      ytVideoId,
      status: postStatus,
    });

    if (postStatus === "pending") {
      await sendTelegramMessage(botToken, chatId, `📝 动态已提交，等待管理员审核后发布。`);
    } else {
      const mediaHint = mediaUrls.length > 0 ? ` (${mediaUrls.length} 个附件)` : "";
      await sendTelegramMessage(botToken, chatId, `✅ 动态已发布${mediaHint}！`);
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("processSingleMessage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
