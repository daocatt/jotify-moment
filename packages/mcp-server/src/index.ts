#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// Configuration from environment variables
const BASE_URL = (process.env.JOTIFY_BASE_URL || "https://jotify.me").replace(/\/$/, "");
const API_TOKEN = process.env.JOTIFY_API_TOKEN || "";

if (!API_TOKEN) {
  console.error("Warning: JOTIFY_API_TOKEN is not set. API calls may fail with 401 Unauthorized.");
}

// Fetch helper with timeout and retry
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  timeoutMs = 15000
): Promise<Response> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastError || new Error(`Request to ${url} failed after ${maxRetries} attempts`);
}

// Helper to convert input (file path, URL, or base64) to buffer and mimeType
async function resolveMediaInput(input: {
  filePath?: string;
  url?: string;
  base64Data?: string;
  mimeType?: string;
  fileName?: string;
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  if (input.filePath) {
    const resolvedPath = path.resolve(input.filePath);
    const buffer = await fs.readFile(resolvedPath);
    const fileName = input.fileName || path.basename(resolvedPath);
    const ext = path.extname(fileName).toLowerCase();

    let mimeType = input.mimeType || "image/jpeg";
    if (ext === ".png") mimeType = "image/png";
    else if (ext === ".webp") mimeType = "image/webp";
    else if (ext === ".gif") mimeType = "image/gif";
    else if (ext === ".mp4") mimeType = "video/mp4";
    else if (ext === ".mp3") mimeType = "audio/mpeg";

    return { buffer, mimeType, fileName };
  }

  if (input.url) {
    const res = await fetchWithRetry(input.url, {});
    if (!res.ok) {
      throw new Error(`Failed to fetch image from URL: ${input.url}, status: ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const urlFileName = path.basename(new URL(input.url).pathname) || "remote-image.jpg";

    return {
      buffer,
      mimeType: contentType.split(";")[0],
      fileName: input.fileName || urlFileName,
    };
  }

  if (input.base64Data) {
    let cleanBase64 = input.base64Data;
    let detectedMime = input.mimeType || "image/jpeg";

    if (cleanBase64.startsWith("data:")) {
      const parts = cleanBase64.split(",");
      const match = parts[0].match(/:(.*?);/);
      if (match) detectedMime = match[1];
      cleanBase64 = parts[1];
    }

    const buffer = Buffer.from(cleanBase64, "base64");
    const ext = detectedMime.split("/")[1] || "jpg";
    const fileName = input.fileName || `generated-${Date.now()}.${ext}`;

    return { buffer, mimeType: detectedMime, fileName };
  }

  throw new Error("One of filePath, url, or base64Data must be provided");
}

async function uploadSingleMedia(
  input: {
    filePath?: string;
    url?: string;
    base64Data?: string;
    mimeType?: string;
    fileName?: string;
  },
  biz = "moment"
) {
  const { buffer, mimeType, fileName } = await resolveMediaInput(input);

  const rawBytes = new Uint8Array(buffer);
  const formData = new FormData();
  const blob = new Blob([rawBytes], { type: mimeType });
  formData.append("file", blob, fileName);

  const res = await fetchWithRetry(`${BASE_URL}/api/v1/upload?biz=${biz}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: formData,
  });

  const data = (await res.json()) as any;
  if (!res.ok || !data.success) {
    throw new Error(`Upload failed: ${JSON.stringify(data)}`);
  }

  return data.media;
}

// Initialize MCP Server
const server = new Server(
  {
    name: "jotify-moment-mcp",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool Definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "jotify_get_profile",
        description: "验证 API 密钥并获取当前登录用户的个人资料（昵称、Slug、角色等）",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "jotify_upload_media",
        description: "上传单个媒体文件到 Jotify Moment。支持传入本地路径、外部图片 URL 或 Base64 数据",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "本地媒体文件的文件系统绝对/相对路径",
            },
            url: {
              type: "string",
              description: "外部公开图片/媒体的 HTTP/HTTPS URL",
            },
            base64Data: {
              type: "string",
              description: "Base64 编码的媒体数据（如生图工具生成的图片）",
            },
            fileName: {
              type: "string",
              description: "自定义保存的文件名（如 photo.jpg）",
            },
            biz: {
              type: "string",
              enum: ["moment", "profile"],
              description: "业务用途（默认 moment）",
            },
          },
        },
      },
      {
        name: "jotify_upload_batch",
        description: "一次性批量上传多张图片或音视频，返回已上传的媒体列表供发帖使用（极大减少交互轮次）",
        inputSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              description: "待上传的媒体数组",
              items: {
                type: "object",
                properties: {
                  filePath: { type: "string" },
                  url: { type: "string" },
                  base64Data: { type: "string" },
                  fileName: { type: "string" },
                },
              },
            },
            filePaths: {
              type: "array",
              description: "快捷本地文件路径数组（例如 [\"/path/1.jpg\", \"/path/2.jpg\"]）",
              items: { type: "string" },
            },
            biz: {
              type: "string",
              enum: ["moment", "profile"],
              description: "业务用途（默认 moment）",
            },
          },
        },
      },
      {
        name: "jotify_create_post",
        description: "在 Jotify Moment 平台发布一条图文/音视频动态。正文支持 Markdown",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Moment 正文内容，支持 Markdown",
            },
            mediaUrls: {
              type: "array",
              description: "配图/多媒体列表（可通过 upload 接口获取）",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["image", "video", "audio"] },
                  url: { type: "string" },
                  name: { type: "string" },
                },
                required: ["url"],
              },
            },
            embedType: { type: "string" },
            embedId: { type: "string" },
          },
          required: ["content"],
        },
      },
      {
        name: "jotify_list_recent_posts",
        description: "查询 Jotify Moment 平台最近发布的公开动态列表",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "返回的动态数量（默认 10）",
            },
          },
        },
      },
    ],
  };
});

// Tool Execution Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "jotify_get_profile") {
      const res = await fetchWithRetry(`${BASE_URL}/api/v1/me`, {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: `获取个人资料失败: ${JSON.stringify(data)}` }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `✅ 身份验证成功！\n用户: ${data.user.name} (@${data.user.slug || "无专属slug"})\n角色: ${data.user.role}\nToken 权限: ${JSON.stringify(data.token?.scopes)}`,
          },
        ],
      };
    }

    if (name === "jotify_upload_media") {
      const media = await uploadSingleMedia(args as any, (args as any)?.biz || "moment");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "媒体文件上传成功",
                media,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "jotify_upload_batch") {
      const { items, filePaths, biz } = args as any;
      const targetItems: any[] = [];

      if (Array.isArray(filePaths)) {
        for (const fp of filePaths) targetItems.push({ filePath: fp });
      }
      if (Array.isArray(items)) {
        for (const item of items) targetItems.push(item);
      }

      if (targetItems.length === 0) {
        return {
          isError: true,
          content: [{ type: "text", text: "未提供任何待上传的文件或图片 (items/filePaths 为空)" }],
        };
      }

      const results = [];
      for (const item of targetItems) {
        const media = await uploadSingleMedia(item, biz || "moment");
        results.push(media);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                total: results.length,
                mediaList: results,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "jotify_create_post") {
      const res = await fetchWithRetry(`${BASE_URL}/api/v1/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          isError: true,
          content: [{ type: "text", text: `发布 Moment 失败: ${JSON.stringify(data)}` }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `🎉 Moment 发布成功！\n🔗 详情链接: ${data.post.url}\n🆔 动态 ID: ${data.post.id}\n⏰ 创建时间: ${data.post.createdAt}`,
          },
        ],
      };
    }

    if (name === "jotify_list_recent_posts") {
      const limit = (args as any)?.limit || 10;
      const res = await fetchWithRetry(`${BASE_URL}/api/v1/posts?limit=${limit}`, {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          isError: true,
          content: [{ type: "text", text: `获取动态列表失败: ${JSON.stringify(data)}` }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.posts, null, 2),
          },
        ],
      };
    }

    return {
      isError: true,
      content: [{ type: "text", text: `未知工具: ${name}` }],
    };
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: `执行异常: ${error.message || String(error)}` }],
    };
  }
});

// Run Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Jotify Moment MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error in MCP Server:", err);
  process.exit(1);
});
