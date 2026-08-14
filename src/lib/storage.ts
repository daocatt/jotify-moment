import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import sharp from "sharp";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/db";
import { eq } from "drizzle-orm";

const DEFAULT_MAX_FILE_SIZE_MB = 50;
const DEFAULT_ALLOWED_EXTENSIONS = "jpg,jpeg,png,gif,webp,mp4,webm,mp3,wav,ogg,m4a";

// Raster image formats that are re-encoded (normalized to WebP) on upload.
// GIF is deliberately excluded to preserve animation.
const REENCODABLE_IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
// Cap decoded pixels to bound decompression-bomb memory usage.
const MAX_IMAGE_PIXELS = 30_000_000;
// Max long-edge for the re-encoded main image (lightbox/covers), keeps files small.
const MAX_MAIN_IMAGE_EDGE = 2560;
const MAX_PROFILE_IMAGE_EDGE = 1920;

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
  "video/webm": [0x1a, 0x45, 0xdf, 0xa3],
  "audio/mpeg": [0xff, 0xfb],
  "audio/ogg": [0x4f, 0x67, 0x67, 0x53],
  "audio/wav": [0x52, 0x49, 0x46, 0x46],
  "audio/m4a": [0x00, 0x00, 0x00],
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signature = MAGIC_BYTES[mimeType];
  if (!signature) return true;
  if (buffer.length < signature.length) return false;
  return signature.every((byte, idx) => buffer[idx] === byte);
}

type StorageConfig = {
  mode: "local" | "s3";
  maxFileSizeMB: number;
  allowedExtensions: string[];
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
  s3Endpoint: string;
  s3Region: string;
  s3PublicUrl: string;
};

let storageConfigCache: { data: StorageConfig; expires: number } | null = null;
const STORAGE_CONFIG_TTL = 60_000; // 60 seconds

export function invalidateStorageConfigCache() {
  storageConfigCache = null;
}

async function getStorageConfig(): Promise<StorageConfig> {
  if (storageConfigCache && Date.now() < storageConfigCache.expires) {
    return storageConfigCache.data;
  }

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

  const data: StorageConfig = {
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

  storageConfigCache = { data, expires: Date.now() + STORAGE_CONFIG_TTL };
  return data;
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

/**
 * Restrict media URLs to those produced by this app's upload pipeline:
 * local `/uploads/...` paths or the configured S3 public base URL.
 * Prevents referencing arbitrary external URLs (hotlinking, tracking, phishing).
 */
export async function isAllowedMediaUrl(url: string): Promise<boolean> {
  if (!url) return false;
  if (url.startsWith("/uploads/")) return !url.includes("..");

  const config = await getStorageConfig();
  if (config.mode !== "s3") return false;
  if (config.s3PublicUrl && url.startsWith(config.s3PublicUrl)) return true;
  if (config.s3Endpoint && config.s3BucketName && url.startsWith(`${config.s3Endpoint}/${config.s3BucketName}`)) return true;
  return false;
}

async function readStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Bridges a web ReadableStream (from File.stream()) into a Node Readable for sharp. */
function webStreamToReadable(stream: ReadableStream<Uint8Array>): Readable {
  const reader = stream.getReader();
  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) this.push(null);
        else this.push(Buffer.from(value));
      } catch (err) {
        this.destroy(err as Error);
      }
    },
  });
}

function isBufferInput(input: Buffer | ReadableStream<Uint8Array>): input is Buffer {
  return input instanceof Buffer;
}

export async function uploadFile(
  input: Buffer | ReadableStream<Uint8Array>,
  originalName: string,
  mimeType: string,
  bizType?: "profile" | "moment",
  size?: number,
): Promise<UploadResult> {
  const config = await getStorageConfig();

  const maxBytes = config.maxFileSizeMB * 1024 * 1024;
  if (isBufferInput(input)) {
    if (input.length > maxBytes) {
      throw new Error(`File size exceeds maximum allowed size of ${config.maxFileSizeMB}MB`);
    }
  } else if (size !== undefined && size > maxBytes) {
    throw new Error(`File size exceeds maximum allowed size of ${config.maxFileSizeMB}MB`);
  }

  const normalizedMime = mimeType.toLowerCase();
  const extension = MIME_TO_EXT[normalizedMime];
  if (!extension) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (!config.allowedExtensions.includes(extension)) {
    throw new Error(`File extension .${extension} is not allowed. Allowed: ${config.allowedExtensions.join(", ")}`);
  }

  let type: "image" | "video" | "audio" = "image";
  if (normalizedMime.startsWith("video/")) type = "video";
  else if (normalizedMime.startsWith("audio/")) type = "audio";

  const isImage = type === "image";
  const isThumbnailable = isImage && bizType !== "profile";
  const reEncodeImage = isImage && REENCODABLE_IMAGE_MIMES.has(normalizedMime);
  // Re-encoded raster images are normalized to WebP (smaller + strips metadata).
  const finalExt = reEncodeImage ? "webp" : extension;

  let mainBuffer: Buffer;
  let thumbnailBuffer: Buffer | null = null;
  const mainContentType = reEncodeImage ? "image/webp" : normalizedMime;

  if (reEncodeImage) {
    // Stream input (from the upload route) so the raw file is never fully
    // buffered; sharp normalizes dimensions/format and strips EXIF metadata.
    let source: Readable;
    if (isBufferInput(input)) source = Readable.from(input);
    else source = webStreamToReadable(input);
    const maxEdge = bizType === "profile" ? MAX_PROFILE_IMAGE_EDGE : MAX_MAIN_IMAGE_EDGE;

    mainBuffer = await source.pipe(
      sharp({ limitInputPixels: MAX_IMAGE_PIXELS, autoOrient: true }),
    )
      .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    if (isThumbnailable) {
      try {
        thumbnailBuffer = await sharp(mainBuffer, { limitInputPixels: MAX_IMAGE_PIXELS })
          .resize(400, 400, { fit: "cover" })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch (err) {
        console.error("Thumbnail generation failed:", err);
      }
    }
  } else {
    // GIF / video / audio: keep original bytes (preserves GIF animation / lossless audio).
    mainBuffer = isBufferInput(input)
      ? input
      : await readStreamToBuffer(input);

    if (!validateMagicBytes(mainBuffer, normalizedMime)) {
      throw new Error(`File content does not match declared MIME type: ${mimeType}`);
    }

    if (isThumbnailable) {
      try {
        thumbnailBuffer = await sharp(mainBuffer, { limitInputPixels: MAX_IMAGE_PIXELS })
          .resize(400, 400, { fit: "cover" })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch (err) {
        console.error("Thumbnail generation failed:", err);
      }
    }
  }

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
  const fileName = `${hash}.${finalExt}`;
  const thumbFileName = `${hash}_thumb.jpg`;
  const key = `${folder}/${fileName}`;
  const thumbKey = `${folder}/${thumbFileName}`;

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
        Body: mainBuffer,
        ContentType: mainContentType,
      })
    );

    const publicUrl = config.s3PublicUrl
      ? `${config.s3PublicUrl}/${key}`
      : `${config.s3Endpoint}/${config.s3BucketName}/${key}`;

    let thumbnailUrl: string | undefined;
    if (thumbnailBuffer) {
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
    fs.writeFileSync(path.join(uploadDir, fileName), mainBuffer);

    if (thumbnailBuffer) {
      fs.writeFileSync(path.join(uploadDir, thumbFileName), thumbnailBuffer);
    }

    return {
      url: `/uploads/${folder}/${fileName}`,
      thumbnailUrl: thumbnailBuffer ? `/uploads/${folder}/${thumbFileName}` : undefined,
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
            : config.s3Endpoint
              ? `${config.s3Endpoint}/${config.s3BucketName}`
              : null;
          if (publicUrl && url.startsWith(publicUrl)) {
            const key = url.slice(publicUrl.length + 1);
            if (key && !key.startsWith("/") && !key.includes("..")) {
              await s3Client.send(new DeleteObjectCommand({ Bucket: config.s3BucketName, Key: key }));
            }
          }
        } else {
          if (url.startsWith("/uploads/") && !url.includes("..")) {
            const publicDir = path.resolve(process.cwd(), "public");
            const filePath = path.resolve(process.cwd(), "public", url);
            if (filePath.startsWith(publicDir + path.sep) && fs.existsSync(filePath)) {
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
