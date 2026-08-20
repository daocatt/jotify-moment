# Jotify Moment MCP Server

Model Context Protocol (MCP) server for **Jotify Moment**.

让 **Claude Desktop**、**Cursor**、**Antigravity** 或任意支持 MCP 的 AI Agent 直接通过自然语言在你的 Jotify Moment 平台上：
- 📸 上传本地图片/音视频文件
- ✍️ 发表 Moment 图文动态
- 🔍 检索最近发布的动态
- 👤 校验登录身份与 Token

---

## 🛠️ 安装与构建

```bash
cd packages/mcp-server
npm install
npm run build
```

---

## ⚙️ 接入配置

### 1. 在 Claude Desktop 中使用

在你的 `claude_desktop_config.json`（macOS 位于 `~/Library/Application Support/Claude/claude_desktop_config.json`）中添加：

```json
{
  "mcpServers": {
    "jotify-moment": {
      "command": "node",
      "args": [
        "/Users/mengdoo/codes/jotify-moment/packages/mcp-server/dist/index.js"
      ],
      "env": {
        "JOTIFY_BASE_URL": "http://localhost:3000",
        "JOTIFY_API_TOKEN": "jotify_pat_你的API密钥"
      }
    }
  }
}
```

> 💡 **获取 API 密钥**：在 Jotify Moment 网页端进入 `/settings` -> 「API 密钥」面板中一键生成。

---

## 🧰 提供的 MCP Tools

| Tool 名称 | 说明 | 参数示例 |
| :--- | :--- | :--- |
| `jotify_get_profile` | 验证当前 API Token 并获取用户基础信息 | 无入参 |
| `jotify_upload_media` | 上传本地图片/音视频到服务器获取远程 URL | `{"filePath": "/path/to/image.png"}` |
| `jotify_create_post` | 创建并发布一条 Moment 动态（支持配图与外链） | `{"content": "今天天气真好！", "mediaUrls": [...]}` |
| `jotify_list_recent_posts` | 获取平台最近发布的公开动态列表 | `{"limit": 10}` |

---

## 💬 自然语言对话示例

- *“帮我发一条 Moment，内容是‘今天完成了项目的新功能开发！’，附带桌面的这张截图”*
- *“查看我最近在 Moment 上发的动态”*
- *“测试一下我的 Jotify Token 是否连通”*
