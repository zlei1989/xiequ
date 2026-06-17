# 数据库表名优化

**日期**: 2026-06-17
**状态**: 设计完成

## 背景

当前浇花模块数据库共有 5 张表，存在命名不一致问题：
- 单复数混用（`watering_devices` 复数 vs `watering_device_state` 单数）
- `watering_logs` 语义不够准确，与其他 `_log` 表（schedule_log、sensor_log）不易区分

## 目标

统一表名单复数风格，让 `watering_logs` 语义更明确。

## 表名变更

| 旧名 | 新名 | 原因 |
|------|------|------|
| `watering_devices` | `watering_device` | 单数化，与 `watering_device_state` 一致 |
| `watering_logs` | `watering_state_log` | 明确为状态变更事件日志，与 `schedule_log`/`sensor_log` 区分 |
| `watering_device_state` | 不变 | 已是单数 |
| `watering_schedule_log` | 不变 | 已是单数 |
| `watering_sensor_log` | 不变 | 已是单数 |

## 影响范围

仅 [app/watering/services/db.ts](../../app/watering/services/db.ts) 内 `initDb()` 中的 SQL 语句引用表名，其余查询均通过该文件封装的函数间接访问，无需修改。

## 迁移策略

在 `initDb()` 中利用 SQLite `ALTER TABLE RENAME TO` 原地迁移：

1. 检查旧表 `watering_devices` 是否存在 → 存在则 `RENAME TO watering_device`
2. 检查旧表 `watering_logs` 是否存在 → 存在则 `RENAME TO watering_state_log`
3. 后续 `CREATE TABLE IF NOT EXISTS` 使用新表名，已迁移的表不会再被创建
4. SQLite 索引跟随表自动重命名，无需额外处理

## 不改动的内容

- 列名保持现有 snake_case 命名
- 索引名保持现有命名
- 封装的查询/写入函数名不变
- 历史文档不回溯修改

## 测试要点

- 新数据库初始化：直接创建新表名，无残留旧表
- 旧数据库升级：迁移后所有 CRUD 操作正常
- `getAllDevices` LEFT JOIN 在新表名下正常工作
