---
name: jotify-moment
description: 为用户在 Jotify Moment 平台发布图文动态、日常生活记录、思考随笔或多媒体内容。支持上传图片并生成包含富媒体的 Moment。
---

# Jotify Moment AI Publisher Skill

当用户要求：“帮我发一条 Moment”、“在动态里分享这张图片”、“总结今天的进展并发布动态” 或需要定时自动化推送内容时使用此技能。

## 环境变量配置

调用本 Skill 前，请确保已配置以下环境变量（在 `.env` 或运行时环境变量中）：
- `JOTIFY_BASE_URL`: Jotify Moment 站点地址（如 `https://moment.example.com`，本地开发通常为 `http://localhost:3000`）
- `JOTIFY_API_TOKEN`: 用户的 Personal Access Token（格式为 `jotify_pat_...`，在 `/settings` 页面中生成）

---

## 核心接口说明

### 1. 验证连通性与身份
- **端点**: `GET /api/v1/me`
- **Header**: `Authorization: Bearer $JOTIFY_API_TOKEN`
- **作用**: 检查 Token 是否有效，并获取当前登录用户的姓名和主页 slug。

---

### 2. 上传配图 / 媒体文件 (可选)
- **端点**: `POST /api/v1/upload`
- **Header**: `Authorization: Bearer $JOTIFY_API_TOKEN`
- **Content-Type**: `multipart/form-data`
- **Body 参数**:
  - `file`: 二进制文件数据（支持 jpeg, png, webp, gif 等）
- **返回数据结构**:
  ```json
  {
    "success": true,
    "media": {
      "type": "image",
      "url": "/uploads/2026/08/xxx.webp",
      "name": "photo.jpg"
    }
  }
  ```

---

### 3. 发布 Moment 动态
- **端点**: `POST /api/v1/posts`
- **Header**: 
  - `Authorization: Bearer $JOTIFY_API_TOKEN`
  - `Content-Type: application/json`
- **Body JSON 参数**:
  - `content` (string, 必填): 动态正文内容，支持 Markdown。
  - `mediaUrls` (array, 可选): 媒体对象数组，例如：
    ```json
    [
      {
        "type": "image",
        "url": "/uploads/2026/08/xxx.webp",
        "name": "photo.jpg"
      }
    ]
    ```
- **返回数据结构**:
  ```json
  {
    "success": true,
    "post": {
      "id": "1829381920",
      "url": "https://moment.example.com/mo/1829381920",
      "content": "...",
      "createdAt": "2026-08-21T03:55:00.000Z"
    }
  }
  ```

---

## MCP 工具直接调用方式 (首选推荐)

如果当前会话已挂载 `jotify-moment` MCP Server，**必须优先调用 MCP 原生工具**，而无需在终端执行长串 Node 脚本：

1. **`jotify_get_profile`**：无入参，测试鉴权并获取当前用户身份。
2. **`jotify_upload_media`**：入参 `{ "filePath": "/path/to/image.jpg" }`，支持系统任意本地文件路径直接读取并上传。
3. **`jotify_create_post`**：入参 `{ "content": "正文", "mediaUrls": [...] }`，完成发布并获取 Moment URL。
4. **`jotify_list_recent_posts`**：入参 `{ "limit": 10 }`，查询最近动态。

---

## Agent 发帖与多媒体处理准则

1. **优先使用 MCP 工具**：当涉及读取外部目录（如 `~/Downloads`、`~/Desktop`）的图片时，优先使用 `jotify_upload_media`，避免使用长串内联 Shell/Node 脚本造成权限确认弹窗刷屏。
2. **构思内容**：将要发布的内容提炼为精炼且有感染力的短文案，可以适当附带 `#标签`。
3. **处理配图**：如果有附图或生成的图片，先调用上传接口获取远程 URL，再组合进 `mediaUrls`。
4. **调用发布**：执行 `jotify_create_post` 或 `POST /api/v1/posts`。
5. **反馈用户**：发布成功后，主动向用户汇报并提供刚刚生成的 Moment 详情链接。

