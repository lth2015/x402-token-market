# X402 · Database Migrations

工具：[golang-migrate](https://github.com/golang-migrate/migrate)（Go binary，轻量、跨语言、跨 DB；不绑 Python/SQLAlchemy）。

## 文件命名

```
NNN_<short_name>.up.sql      正向迁移
NNN_<short_name>.down.sql    回滚
```

例：`001_init.up.sql` / `001_init.down.sql`、`002_add_refund_reason.up.sql`。

## 命令

```bash
# 本地（docker-compose 起 MySQL）
export DSN='mysql://x402_app:x402_app_test@tcp(localhost:3306)/x402_qa'
migrate -database "$DSN" -path db/migrations up
migrate -database "$DSN" -path db/migrations down 1     # 回滚最近 1 条
migrate -database "$DSN" -path db/migrations version    # 查当前版本

# QA（CI/CD）
# deploy.yml 中预先跑 `migrate up`，再部署 K8s
```

## 规则

1. **001_init.up.sql** = 当前 `db/SCHEMA.sql` 全部 DDL；之后 schema 演进只加新 migration，不改 SCHEMA.sql（SCHEMA.sql 仅作为"当前完整态"的快照参考）
2. 任何 migration 必须**幂等**：用 `CREATE TABLE IF NOT EXISTS`、`ALTER TABLE ... IF EXISTS COLUMN` 等
3. DOWN 必须真正可回滚（不能空文件）
4. 破坏性变更（drop column / drop table）：先 mark deprecated 一个版本，下次 release 再真删
5. 数据迁移与 schema 迁移分开：data migration 用 `NNN_data_*.up.sql`，可重跑

## CI 校验

每 PR：
```bash
migrate -path db/migrations -database "$TEST_DSN" up
migrate -path db/migrations -database "$TEST_DSN" down  # 全回滚
migrate -path db/migrations -database "$TEST_DSN" up    # 再次 up
# 三步全绿才允许 merge
```

## 初始 migration

将 [../SCHEMA.sql](../SCHEMA.sql) 内容拆分为：
- `001_init.up.sql` — 全部 CREATE TABLE / CREATE TRIGGER / INSERT seed
- `001_init.down.sql` — DROP 所有表 + 触发器（开发期需要 reset 用）

后续每个 schema 变更 → 新增 `00N_*.up.sql` + `00N_*.down.sql`。

## golang-migrate 安装

```bash
# macOS
brew install golang-migrate

# Linux
curl -L https://github.com/golang-migrate/migrate/releases/latest/download/migrate.linux-amd64.tar.gz | tar xvz
sudo mv migrate /usr/local/bin/
```
