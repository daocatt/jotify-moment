import fs from "fs";
import path from "path";
import crypto from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

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

// Allowed MIME types and extensions
const ALLOWED_MIME_TYPES: Record<string, string> = {
  // Images
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  // Video
  "video/mp4": "mp4",
  "video/webm": "webm",
  // Audio
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
};

// Configure S3/R2 if environment variables exist
const s3Configured =
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY &&
  process.env.S3_BUCKET_NAME;

const s3Client = s3Configured
  ? new S3Client({
      endpoint: process.env.S3_ENDPOINT, // Optional for S3, required for Cloudflare R2
      region: process.env.S3_REGION || "auto",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export interface UploadResult {
  url: string;
  name: string;
  type: "image" | "video" | "audio";
}

export async function uploadFile(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<UploadResult> {
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const extension = ALLOWED_MIME_TYPES[mimeType] || ALLOWED_MIME_TYPES[mimeType.toLowerCase()];
  
  if (!extension) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  if (!validateMagicBytes(fileBuffer, mimeType)) {
    throw new Error(`File content does not match declared MIME type: ${mimeType}`);
  }

  // Get type
  let type: "image" | "video" | "audio" = "image";
  if (mimeType.startsWith("video/")) {
    type = "video";
  } else if (mimeType.startsWith("audio/")) {
    type = "audio";
  }

  // YearMonth directory format: YYYYMM
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  // Encrypt/randomize filename: uuid + extension
  const randomName = `${crypto.randomUUID()}.${extension}`;
  const key = `${yearMonth}/${randomName}`;

  if (s3Configured && s3Client) {
    // S3 / R2 Upload
    const bucket = process.env.S3_BUCKET_NAME!;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      })
    );
    // Custom S3 public URL or standard endpoint URL
    const publicUrl = process.env.S3_PUBLIC_URL 
      ? `${process.env.S3_PUBLIC_URL}/${key}`
      : `${process.env.S3_ENDPOINT}/${bucket}/${key}`;
    return {
      url: publicUrl,
      name: originalName,
      type,
    };
  } else {
    // Local storage upload
    const uploadDir = path.join(process.cwd(), "public", "uploads", yearMonth);
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, randomName);
    fs.writeFileSync(filePath, fileBuffer);
    
    // Web url path
    const url = `/uploads/${yearMonth}/${randomName}`;
    return {
      url,
      name: originalName,
      type,
    };
  }
}

export async function deleteMediaFiles(mediaUrls: Array<{ type: string; url: string; name: string; duration?: number }>) {
  for (const media of mediaUrls) {
    try {
      if (s3Configured && s3Client) {
        const bucket = process.env.S3_BUCKET_NAME!;
        const publicUrl = process.env.S3_PUBLIC_URL || `${process.env.S3_ENDPOINT}/${bucket}`;
        if (media.url.startsWith(publicUrl)) {
          const key = media.url.slice(publicUrl.length + 1);
          await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        }
      } else {
        if (media.url.startsWith("/uploads/")) {
          const filePath = path.join(process.cwd(), "public", media.url);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (error) {
      console.error("Failed to delete media file:", media.url, error);
    }
  }
}
