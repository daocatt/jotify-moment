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

## Agent 发帖最佳实践

1. **构思内容**：将要发布的内容提炼为精炼且有感染力的短文案，可以适当附带 `#标签`。
2. **处理配图**：如果有附图或生成的图片，先调用上传接口获取远程 URL，再组合进 `mediaUrls`。
3. **调用发布**：执行 `POST /api/v1/posts`。
4. **反馈用户**：发布成功后，主动向用户汇报并提供刚刚生成的 Moment 详情链接。
