import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_MAX_FILE_SIZE_MB = 50;
const DEFAULT_ALLOWED_EXTENSIONS = "jpg,jpeg,png,gif,webp,mp4,webm,mp3,wav,ogg,m4a";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
};

const MAGIC_BYTES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/gif": [0x47, 0x49, 0x46],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
  "video/mp4": [0x00, 0x00, 0x00],
  "audio/mpeg": [0xff, 0xfb],
  "audio/ogg": [0x4f, 0x67, 0x67, 0x53],
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signature = MAGIC_BYTES[mimeType];
  if (!signature) return true;
  if (buffer.length < signature.length) return false;
  return signature.every((byte, idx) => buffer[idx] === byte);
}

async function getStorageConfig(): Promise<{
  mode: "local" | "s3";
  maxFileSizeMB: number;
  allowedExtensions: string[];
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
  s3Endpoint: string;
  s3Region: string;
  s3PublicUrl: string;
}> {
  const rows = await db.query.settings.findMany({
    where: (s, { or }) => or(
      eq(s.key, "storage_mode"),
      eq(s.key, "storage_max_file_size_mb"),
      eq(s.key, "storage_allowed_extensions"),
      eq(s.key, "storage_s3_access_key_id"),
      eq(s.key, "storage_s3_secret_access_key"),
      eq(s.key, "storage_s3_bucket_name"),
      eq(s.key, "storage_s3_endpoint"),
      eq(s.key, "storage_s3_region"),
      eq(s.key, "storage_s3_public_url")
    ),
  });

  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const mode = map.storage_mode === "s3" ? "s3" : "local";
  const maxFileSizeMB = parseInt(map.storage_max_file_size_mb || String(DEFAULT_MAX_FILE_SIZE_MB), 10);
  const allowedExtensions = (map.storage_allowed_extensions || DEFAULT_ALLOWED_EXTENSIONS).split(",").map((e: string) => e.trim().toLowerCase().replace(/^\./, ""));

  return {
    mode,
    maxFileSizeMB,
    allowedExtensions,
    s3AccessKeyId: map.storage_s3_access_key_id || "",
    s3SecretAccessKey: map.storage_s3_secret_access_key || "",
    s3BucketName: map.storage_s3_bucket_name || "",
    s3Endpoint: map.storage_s3_endpoint || "",
    s3Region: map.storage_s3_region || "auto",
    s3PublicUrl: map.storage_s3_public_url || "",
  };
}

export interface UploadResult {
  url: string;
  thumbnailUrl?: string;
  name: string;
  type: "image" | "video" | "audio";
}

export async function getUploadLimits(): Promise<{ maxFileSizeMB: number; allowedExtensions: string[] }> {
  const config = await getStorageConfig();
  return { maxFileSizeMB: config.maxFileSizeMB, allowedExtensions: config.allowedExtensions };
}

export async function uploadFile(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
  bizType?: "profile" | "moment"
): Promise<UploadResult> {
  const config = await getStorageConfig();

  if (fileBuffer.length > config.maxFileSizeMB * 1024 * 1024) {
    throw new Error(`File size exceeds maximum allowed size of ${config.maxFileSizeMB}MB`);
  }

  const extension = MIME_TO_EXT[mimeType] || MIME_TO_EXT[mimeType.toLowerCase()];
  if (!extension) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (!config.allowedExtensions.includes(extension)) {
    throw new Error(`File extension .${extension} is not allowed. Allowed: ${config.allowedExtensions.join(", ")}`);
  }

  if (!validateMagicBytes(fileBuffer, mimeType)) {
    throw new Error(`File content does not match declared MIME type: ${mimeType}`);
  }

  let type: "image" | "video" | "audio" = "image";
  if (mimeType.startsWith("video/")) type = "video";
  else if (mimeType.startsWith("audio/")) type = "audio";

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  let folder = "";
  if (bizType === "profile") {
    folder = `profile/${yearMonth}`;
  } else {
    // Default to moment folder division by media type
    if (type === "image") {
      folder = `moment/images/${yearMonth}`;
    } else if (type === "audio") {
      folder = `moment/voice/${yearMonth}`;
    } else if (type === "video") {
      folder = `moment/video/${yearMonth}`;
    }
  }

  const hash = crypto.randomBytes(16).toString("hex");
  const fileName = `${hash}.${extension}`;
  const thumbFileName = `${hash}_thumb.${extension}`;
  const key = `${folder}/${fileName}`;
  const thumbKey = `${folder}/${thumbFileName}`;

  const isImage = type === "image";

  let thumbnailBuffer: Buffer | null = null;
  if (isImage && bizType !== "profile") {
    try {
      const rawThumb = await sharp(fileBuffer)
        .resize(400, 400, { fit: "cover" })
        .jpeg({ quality: 80 })
        .toBuffer();
      thumbnailBuffer = Buffer.alloc(rawThumb.length);
      thumbnailBuffer.set(rawThumb);
    } catch (err) {
      console.error("Thumbnail generation failed:", err);
    }
  }

  if (config.mode === "s3" && config.s3AccessKeyId && config.s3SecretAccessKey && config.s3BucketName) {
    const s3Client = new S3Client({
      endpoint: config.s3Endpoint || undefined,
      region: config.s3Region || "auto",
      credentials: {
        accessKeyId: config.s3AccessKeyId,
        secretAccessKey: config.s3SecretAccessKey,
      },
    });

    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.s3BucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      })
    );

    const publicUrl = config.s3PublicUrl
      ? `${config.s3PublicUrl}/${key}`
      : `${config.s3Endpoint}/${config.s3BucketName}/${key}`;

    let thumbnailUrl: string | undefined;
    if (isImage && thumbnailBuffer) {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: config.s3BucketName,
          Key: thumbKey,
          Body: thumbnailBuffer,
          ContentType: "image/jpeg",
        })
      );
      thumbnailUrl = config.s3PublicUrl
        ? `${config.s3PublicUrl}/${thumbKey}`
        : `${config.s3Endpoint}/${config.s3BucketName}/${thumbKey}`;
    }

    return { url: publicUrl, thumbnailUrl, name: originalName, type };
  } else {
    const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadDir, fileName), fileBuffer);

    if (isImage && thumbnailBuffer) {
      fs.writeFileSync(path.join(uploadDir, thumbFileName), thumbnailBuffer);
    }

    return {
      url: `/uploads/${folder}/${fileName}`,
      thumbnailUrl: isImage ? `/uploads/${folder}/${thumbFileName}` : undefined,
      name: originalName,
      type,
    };
  }
}

export async function deleteMediaFiles(mediaUrls: Array<{ type: string; url: string; name: string; duration?: number; thumbnailUrl?: string }>) {
  const config = await getStorageConfig();

  for (const media of mediaUrls) {
    const urlsToDelete = [media.url];
    if (media.thumbnailUrl) urlsToDelete.push(media.thumbnailUrl);

    for (const url of urlsToDelete) {
      try {
        if (config.mode === "s3" && config.s3AccessKeyId && config.s3SecretAccessKey && config.s3BucketName) {
          const s3Client = new S3Client({
            endpoint: config.s3Endpoint || undefined,
            region: config.s3Region || "auto",
            credentials: {
              accessKeyId: config.s3AccessKeyId,
              secretAccessKey: config.s3SecretAccessKey,
            },
          });

          const publicUrl = config.s3PublicUrl
            ? `${config.s3PublicUrl}`
            : `${config.s3Endpoint}/${config.s3BucketName}`;
          if (url.startsWith(publicUrl)) {
            const key = url.slice(publicUrl.length + 1);
            await s3Client.send(new DeleteObjectCommand({ Bucket: config.s3BucketName, Key: key }));
          }
        } else {
          if (url.startsWith("/uploads/")) {
            const filePath = path.join(process.cwd(), "public", url);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }
        }
      } catch (error) {
        console.error("Failed to delete media file:", url, error);
      }
    }
  }
}
