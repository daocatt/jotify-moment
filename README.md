# Jotify Moment

一个轻量的日志系统。

---

## 目录

* [基本简介](#基本简介)
* [本地部署](#本地部署)
* [GitHub 部署](#github-部署)
* [VPS 部署](#vps-部署)

---

## 核心功能

* **Telegram Bot 深度绑定**：
  * **一键集成**：在控制台一键接入 Bot，webhook 自动认证防泄露
  * **快速发帖**：直接给 Bot 发送文字、图片、语音或视频，平台自动同步发布
  * **用户自助绑定**：一键唤起 Bot 绑定
* **Resend 集成**：邮箱验证码，注册，找回密码

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
* `DOCKER_DATA_PATH`：指定本地数据及上传文件存储的基准文件夹（本地建议保留 `./data`）。

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

打开 `http://localhost:3000` 即可预览项目。首个注册的账户将自动获得 **超级管理员（Super Admin）** 权限。

---

## GitHub 部署

项目内置了生产级持续集成与部署（CD）工作流，定义在 [.github/workflows/deploy.yml](file:///.github/workflows/deploy.yml) 中。当您将代码推送至 `main` 分支时，系统会自动执行类型检查、模拟构建并远程 SSH 部署至 VPS 服务器。

### ⚙️ GitHub Secrets 配置项

请在您的 GitHub 仓库的 **Settings -> Secrets and variables -> Actions** 中配置以下 **Repository Secrets**：

| Secret 键名 | 示例值 | 说明 |
| :--- | :--- | :--- |
| `VPS_HOST` | `1.2.3.4` | 服务器公网 IP 地址 |
| `VPS_USERNAME` | `root` | 用于 SSH 连接的登录用户名 |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | 登录服务器所用的 SSH 私钥 |
| `VPS_PORT` | `22` | SSH 端口号（默认为 22） |
| `VPS_PROJECT_PATH` | `/www/my_project/jotify_moment` | VPS 上的项目代码克隆及运行根目录 |
| `VPS_ENV_FILE` | `/www/my_project/jotify_moment/.env.prod` | VPS 上预先存放的真实生产配置文件路径 |

配置完成后，向 `main` 分支执行 `git push`，即可自动触发一键打包并无缝重启服务器上运行的 Docker 服务。

---

## VPS 部署

直接通过 Docker Compose 运行容器进行自托管部署，适合手动管理服务的用户。

### 1. 环境准备

在您的 VPS 服务器上安装 Docker 及 Docker Compose，并确保应用和数据库目录有写权限。

### 2. 准备物理配置文件

在 VPS 的应用运行目录（如 `/www/my_project/jotify_moment`）中拉取源码：

```bash
git clone https://github.com/your-username/jotify-moment.git .
```

在此目录下，编辑创建您生产环境使用的 `.env.prod` 配置文件：

```env
# PostgreSQL 容器配置
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_super_strong_password
POSTGRES_DB=jotify_moment
DB_PORT=5432
DOCKER_DATA_PATH=/www/my_project/jotify_moment/data

# App 容器运行配置
APP_PORT=3000
DATABASE_URL=postgres://postgres:your_super_strong_password@db:5432/jotify_moment

# Better Auth 认证配置
BETTER_AUTH_SECRET=your_32_bytes_hex_secret
BETTER_AUTH_URL=https://your-moment-domain.com
```

### 3. 一键启动容器

生产环境中通过 `--env-file` 指定独立配置文件启动：

```bash
# 启动所有服务（自动完成初始化数据库构建及脚本迁移）
docker compose --env-file .env.prod up -d
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
