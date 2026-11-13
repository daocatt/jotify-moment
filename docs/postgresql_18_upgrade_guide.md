# PostgreSQL 18 升级与数据迁移恢复指南

本文档记录 Jotify Moment 数据库从 **PostgreSQL 17** 升级至 **PostgreSQL 18** 的完整迁移与恢复操作流程。

---

## 一、背景说明

- **基础镜像更新**：[`Dockerfile.db`](../Dockerfile.db) 已升级为 `FROM postgres:18-alpine`。
- **构建策略优化**：CI/CD [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) 构建指令已更新为 `docker compose build --no-cache --pull`，确保每次构建都强制拉取最新的官方基础镜像，防范已公布的 CVE 安全漏洞。
- **跨大版本（17 → 18）不兼容限制**：PostgreSQL 跨大版本升级时，底层的磁盘存储格式（Data Catalog / Page Layout）不兼容。直接以 PG 18 读取 PG 17 挂载的数据目录会导致启动崩溃。因此必须通过 **数据导出（Dump）→ 重置空数据目录（Init PG18）→ 数据导入（Restore）** 的标准流程完成迁移。

---

## 二、升级前准备（确认备份）

在触发自动部署之前，必须确认已有完整的数据备份：

```bash
# 1. 登录 VPS 项目目录
cd /path/to/jotify-moment

# 2. 导出 PostgreSQL 17 数据备份（自定义二进制压缩格式）
docker exec -t jotify-moment-db pg_dump -U postgres -d jotify_moment -F c -b -v -f /tmp/backup_pg17.dump

# 3. 将备份文件拷贝至宿主机妥善保存
docker cp jotify-moment-db:/tmp/backup_pg17.dump ./backup_pg17.dump
ls -lh ./backup_pg17.dump
```

---

## 三、触发自动部署

1. 代码合并并推送到 `main` 分支后，GitHub Actions 的 **Production CD** 流程会自动执行：
   - 强制拉取最新的 `postgres:18-alpine` 基础镜像；
   - 自动重新编译 `Dockerfile.db`（预编译并安装 `pg_bigm` 插件）；
   - 自动拉取并构建最新的 `web` 服务镜像。

---

## 四、部署后的 VPS 数据恢复步骤

部署完成后，由于宿主机的 `./data/postgres` 仍残留 PG 17 的老数据，PG 18 容器初次启动会报错并等待初始化。请按以下步骤在 VPS 上恢复数据：

### 1. 停止服务并归档老数据目录
```bash
cd /path/to/jotify-moment

# 停止当前运行容器
docker compose down

# 将旧版的 PG 17 数据目录做安全归档（保留至少几周）
mv ./data/postgres ./data/postgres_v17_bak

# 创建全新的空目录用于 PG 18 初始化
mkdir -p ./data/postgres
chmod 700 ./data/postgres
```

### 2. 启动全新的 PostgreSQL 18 服务
```bash
# 启动数据库容器（此时由于是空目录，PG 18 会自动执行初始化并创建空库）
docker compose up -d db

# 观察启动日志，确认数据库已初始化成功并处于 ready to accept connections 状态
docker logs -f jotify-moment-db
```
*(看到 `database system is ready to accept connections` 后，按 `Ctrl+C` 退出日志查看)*

### 3. 恢复备份数据至 PostgreSQL 18
```bash
# 将宿主机的备份文件拷贝进入 PG 18 容器
docker cp ./backup_pg17.dump jotify-moment-db:/tmp/backup_pg17.dump

# 执行恢复（使用 pg_restore 导入）
docker exec -i jotify-moment-db pg_restore -U postgres -d jotify_moment -v /tmp/backup_pg17.dump

# 清理容器内的临时 dump 文件
docker exec -it jotify-moment-db rm -f /tmp/backup_pg17.dump
```

> [!NOTE]
> `pg_restore` 可能会输出一些对象已存在的 Notice/Warning（例如 `public` schema 或预装扩展），属于正常现象。只要未出现致命错误即可。

### 4. 启动 Web 服务并验证
```bash
# 启动全套服务
docker compose up -d

# 查看 Web 容器运行状态
docker compose logs -f web
```

打开网站验证：
- 动态流（Timeline）展示正常；
- 关键词全文搜索（依赖 `pg_bigm`）功能正常；
- 用户登录、作品集展示及发帖功能正常。

---

## 五、应急回滚方案（若需退回 PG 17）

若在升级过程中遇到任何意外需要紧急回退：

```bash
# 1. 停止容器
docker compose down

# 2. 换回 PG 17 的原始数据目录
rm -rf ./data/postgres
mv ./data/postgres_v17_bak ./data/postgres

# 3. 将 Dockerfile.db 中的基础镜像切回 17
sed -i 's/FROM postgres:18-alpine/FROM postgres:17-alpine/g' Dockerfile.db

# 4. 重新构建并启动服务
docker compose build db
docker compose up -d
```
