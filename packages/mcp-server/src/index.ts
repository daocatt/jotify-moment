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
const BASE_URL = (process.env.JOTIFY_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const API_TOKEN = process.env.JOTIFY_API_TOKEN || "";

if (!API_TOKEN) {
  console.error("Warning: JOTIFY_API_TOKEN is not set. API calls may fail with 401 Unauthorized.");
}

// Initialize MCP Server
const server = new Server(
  {
    name: "jotify-moment-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define Schemas
const CreatePostInputSchema = z.object({
  content: z.string().describe("动态的正文内容，支持 Markdown"),
  mediaUrls: z
    .array(
      z.object({
        type: z.enum(["image", "video", "audio"]).default("image"),
        url: z.string().describe("媒体文件 URL（通过上传接口返回的地址）"),
        name: z.string().optional().describe("媒体文件名"),
      })
    )
    .optional()
    .describe("关联的配图或音视频列表（最多 9 个）"),
  embedType: z.string().optional().describe("外链嵌入类型（如 bilibili, youtube, spotify 等）"),
  embedId: z.string().optional().describe("外链 ID 或视频/音频标识"),
});

const UploadMediaInputSchema = z.object({
  filePath: z.string().describe("本地文件的绝对路径或相对路径（支持 JPG, PNG, WEBP, GIF 等）"),
  biz: z.enum(["moment", "profile"]).default("moment").describe("业务类型（默认为 moment）"),
});

const GetProfileInputSchema = z.object({});

const ListPostsInputSchema = z.object({
  limit: z.number().min(1).max(50).default(10).describe("获取的动态数量 (1-50)"),
});

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
        description: "上传本地图片、音视频到 Jotify Moment 平台，返回远程 URL 供发帖使用",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "本地媒体文件的文件系统路径",
            },
            biz: {
              type: "string",
              enum: ["moment", "profile"],
              description: "业务用途（默认 moment）",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "jotify_create_post",
        description: "在 Jotify Moment 平台发布一条图文/音视频动态",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Moment 正文内容，支持 Markdown 与标签",
            },
            mediaUrls: {
              type: "array",
              description: "配图/多媒体列表",
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
      const res = await fetch(`${BASE_URL}/api/v1/me`, {
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
      const { filePath, biz } = UploadMediaInputSchema.parse(args);
      const resolvedPath = path.resolve(filePath);

      const fileBuffer = await fs.readFile(resolvedPath);
      const fileName = path.basename(resolvedPath);
      const ext = path.extname(fileName).toLowerCase();

      let mimeType = "image/jpeg";
      if (ext === ".png") mimeType = "image/png";
      else if (ext === ".webp") mimeType = "image/webp";
      else if (ext === ".gif") mimeType = "image/gif";
      else if (ext === ".mp4") mimeType = "video/mp4";
      else if (ext === ".mp3") mimeType = "audio/mpeg";

      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append("file", blob, fileName);

      const res = await fetch(`${BASE_URL}/api/v1/upload?biz=${biz || "moment"}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          isError: true,
          content: [{ type: "text", text: `媒体文件上传失败: ${JSON.stringify(data)}` }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "媒体文件上传成功",
                media: data.media,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "jotify_create_post") {
      const parsed = CreatePostInputSchema.parse(args);

      const res = await fetch(`${BASE_URL}/api/v1/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed),
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
      const { limit } = ListPostsInputSchema.parse(args || {});

      const res = await fetch(`${BASE_URL}/api/v1/posts?limit=${limit}`, {
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
