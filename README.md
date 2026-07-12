# Jotify Moment

一个轻量的日志系统 / A lightweight moment journal.

---

## 目录

* [基本简介](#基本简介)
* [技术栈](#技术栈)
* [功能特性](#功能特性)
* [本地部署](#本地部署)
* [GitHub 部署](#github-部署)
* [VPS 部署](#vps-部署)
* [主题系统](#主题系统)
* [自定义域名](#自定义域名)
* [安全说明](#安全说明)

---

## 基本简介

![Jotify Moment 界面预览](docs/screenshot.png)

Jotify Moment 是一个自托管的朋友圈风格日志平台，支持 Markdown 编辑、多媒体发布、Telegram Bot 集成，以及自定义域名绑定。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 + React 19 |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 数据库 | PostgreSQL (Drizzle ORM) |
| 认证 | Better Auth |
| 邮件 | Resend |
| 存储 | 本地文件系统 / S3 兼容 (R2 等) |
| 部署 | Docker + Docker Compose |

## 功能特性

* **Telegram Bot 深度绑定**：
  * **一键集成**：在控制台一键接入 Bot，webhook 自动认证防泄露
  * **快速发帖**：直接给 Bot 发送文字、图片、语音或视频，平台自动同步发布
  * **用户自助绑定**：一键唤起 Bot 绑定
* **Markdown 支持**：GFM 语法 + 自动换行，安全渲染（不启用 raw HTML）
* **多媒体发布**：图片（自动缩略图）、语音、视频、YouTube 嵌入
* **自定义域名**：绑定独立域名，Caddy On-Demand TLS 自动申请证书
* **主题系统**：支持 light/dark 切换，可自定义主题
* **Resend 集成**：邮箱验证码，注册，找回密码
* **管理控制台**：用户管理、帖子审核、评论管理、存储配置

---

## 本地部署

### 1. 克隆并安装依赖

```bash
git clone https://github.com/daocatt/jotify-moment.git
cd jotify-moment
npm install
```

### 2. 配置文件

复制环境配置文件模板并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，补充以下必须参数：

* `DATABASE_URL`：PostgreSQL 数据库连接串。
* `BETTER_AUTH_SECRET`：Auth 模块加密秘钥（可使用命令生成：`openssl rand -hex 32`）。
* `BETTER_AUTH_URL`：本地默认为 `http://localhost:3000`。
* `DOCKER_DATA_PATH`：Docker 容器映射的数据及上传文件存储的基准文件夹（本地建议保留 `./data`）。

### 3. 启动本地数据库

如果您本地有 Docker 容器环境，可直接通过 docker 启动辅助数据库：

```bash
docker compose up -d db
```

### 4. 运行数据库迁移并启动开发服务器

```bash
# 生成并运行 schema 同步
npx drizzle-kit push

# 运行本地开发服务器
npm run dev
```

打开 `http://localhost:3000` 即可预览项目

---

## GitHub 部署

### ⚙️ GitHub Secrets 配置项

请在您的 GitHub 仓库的 **Settings -> Secrets and variables -> Actions** 中配置以下 **Repository Secrets**：

| Secret 键名 | 示例值 | 说明 |
| :--- | :--- | :--- |
| `VPS_HOST` | `1.2.3.4` | 服务器公网 IP 地址 |
| `VPS_USERNAME` | `root` | 用于 SSH 连接的登录用户名 |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | 登录服务器所用的 SSH 私钥 |
| `VPS_PORT` | `22` | SSH 端口号（默认为 22） |
| `VPS_PROJECT_PATH` | `/www/my_project/jotify_moment/webapp` | VPS 上的项目代码克隆及运行根目录 |
| `VPS_ENV_FILE` | `/www/my_project/jotify_moment/.env.prod` | VPS 上预先存放的真实生产配置文件路径 |

配置完成后，向 `main` 分支执行 `git push`，即可自动触发一键打包并无缝重启服务器上运行的 Docker 服务。

---

## VPS 部署

直接通过 Docker Compose 运行容器进行自托管部署，适合手动管理服务的用户。

### 1. 环境准备

在您的 VPS 服务器上安装 Docker 及 Docker Compose，并确保应用和数据库目录有写权限。

### 2. 准备物理配置文件

在 VPS 的应用运行目录（如 `/www/my_project/jotify_moment/webapp`）中拉取源码：

```bash
git clone https://github.com/daocatt/jotify-moment.git .
```

在此目录下，编辑创建您生产环境使用的 `.env` 配置文件：

```env
# PostgreSQL 容器配置
POSTGRES_USER=postgres
POSTGRES_PASSWORD=[强密码]
POSTGRES_DB=jotify_moment
DB_PORT=5432
DOCKER_DATA_PATH=/www/my_project/jotify_moment/data

# App 容器运行配置
APP_PORT=3000
DATABASE_URL=postgres://postgres:[强密码]@db:5432/jotify_moment

# Better Auth 认证配置
BETTER_AUTH_SECRET=your_32_bytes_hex_secret
BETTER_AUTH_URL=https://your-moment-domain.com
```

### 3. 一键启动容器

生产环境中通过 `--env-file` 指定独立配置文件启动：

```bash
# 启动所有服务（自动完成初始化数据库构建及脚本迁移）
docker compose --env-file .env up -d
```

启动后容器将映射内部 `3000` 端口至您指定的宿主机 `APP_PORT`（仅对本地 `127.0.0.1` 暴露以确保安全）。

### 4. 反向代理配置 (以 Nginx 为例)

在 Nginx 配置中配置反向代理以支持 SSL 与访问转发：

```nginx
server {
    listen 80;
    server_name your-moment-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-moment-domain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 50M; # 允许发表大体积音视频文件

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

配置重载并启用后，您的个人瞬间平台即搭建部署完毕。

---

## 主题系统

Jotify Moment 支持自定义主题。主题由 `src/themes/` 目录下的 `theme-config.json` 和 `theme.css` 组成。

### 内置主题

* **默认主题**：支持 light/dark/system 三种模式
* **微信经典**：仿微信朋友圈风格，仅 light 模式

### 创建自定义主题

1. 在 `src/themes/` 下新建目录，如 `src/themes/my-theme/`
2. 创建 `theme-config.json`：

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "author": "Your Name",
  "version": "1.0.0",
  "features": {
    "supportedModes": ["light", "dark", "system"],
    "showCoverImage": true,
    "showBio": true
  }
}
```

3. 创建 `theme.css`，使用 CSS 变量覆盖默认样式（参考 `src/themes/default/theme.css`）
4. 运行 `npm run themes:scan` 生成主题注册表
5. 在管理控制台选择主题

---

## 自定义域名

Jotify Moment 支持用户绑定独立域名，配合 Caddy On-Demand TLS 自动申请 SSL 证书。详细配置参见 [`docs/caddy_config.md`](docs/caddy_config.md)。

**工作流程：**
1. 管理员在后台开启「允许自定义域名」功能
2. 为特定用户开启自定义域名权限
3. 用户绑定域名并将 CNAME 解析到主站
4. Caddy 通过后端 API 验证域名后自动申请证书

> **OAuth2 认证说明**：自定义域名用户登录时，系统使用 OAuth2 Authorization Code 流程将认证请求重定向到主站。所有自定义域名客户端共享 `BETTER_AUTH_SECRET` 作为 `client_secret`，该密钥仅在服务端 token 交换时使用，不会暴露给浏览器。如果需要为每个域名使用独立的 secret，可以在 `users` 表中增加字段存储。

---

## 安全说明

* Markdown 渲染不启用 `rehype-raw`，防止 XSS 攻击
* 文件上传校验 Magic Bytes，防止伪装文件类型
* Telegram Webhook 使用 `timingSafeEqual` 防止时序攻击
* Caddy Ask API 使用 `timingSafeEqual` 验证 Token
* 密码使用 scrypt 哈希存储
* Session Cookie 设置 `httpOnly` + `secure` + `sameSite=lax`
* CSP、HSTS、X-Frame-Options 等安全头已配置
* Favicon 远程获取有 SSRF 防护（DNS rebinding 检查）
* 文件路径遍历防护（上传、删除、favicon）
* 登录/验证码/密码重置均有 Rate Limit

## License

[MIT](LICENSE)
