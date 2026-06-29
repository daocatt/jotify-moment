# Drizzle ORM 生产级数据库迁移指引 (Drizzle Migration Standard Guide)

为保证线上数据的完整性和高可用，在修改数据库结构时，开发和部署团队必须严格遵守以下工业级 Drizzle 迁移操作步骤。

---

## 🏗️ 步骤一：本地 Schema 修改与变更生成

1. **更新 Schema 文件**：
   在 `src/db/schema.ts` 中完成实体类的增删查改。
2. **安全生成 SQL 迁移代码**：
   执行生成命令：
   ```bash
   npm run db:generate
   ```
   Drizzle Kit 会自动对比 schema 代码与上一次 migration 状态，并在 `src/db/migrations/` 下输出新的 SQL 文件（如 `0001_xxxx.sql`）。

---

## 🔍 步骤二：严格的 SQL 代码审查 (Critical Code Review)

生成的 SQL 迁移文件**必须**经过团队或核心开发人员手动审查，特别注意以下高风险操作：

> [!CAUTION]
> **高危数据库变动警告**：
> 1. **添加 `NOT NULL` 字段**：若表中已有旧数据，添加 `NOT NULL` 必须带上默认值（`default(...)`），或拆分为两步迁移（1. 允许 NULL 并填充默认，2. 修改约束为 NOT NULL）。
> 2. **字段/表重命名**：Drizzle Kit 生成的脚本可能是“先 Drop 后 Create”，导致旧数据丢失！若重命名，需修改 SQL 语句为 `ALTER TABLE ... RENAME ...`。
> 3. **字段类型修改**：评估类型转换的兼容性，并确认数据库是否需要做全表扫描/锁表。

---

## 🧪 步骤三：本地/预发环境灰度验证

在执行线上迁移前，请先在本地或 Stagging 环境执行试运行，检测是否存在语法错误或执行阻塞。

```bash
# 执行本地迁移
npm run db:migrate
```

---

## 🚀 步骤四：生产部署流水线迁移顺序

在 CI/CD 和生产环境下，必须遵循**“先改数据库，后发应用包”**（或兼容性迁移）原则，保证滚动更新时正在运行的旧版本应用不发生崩盘。

1. **备份数据库**：重大迁移前执行物理或逻辑备份。
2. **应用 DB 迁移**：
   在构建阶段或启动阶段执行迁移命令（在多容器实例中应有锁保护，只执行一次）：
   ```bash
   npm run db:migrate
   ```
3. **滚动部署新版本 Web 实例**。
