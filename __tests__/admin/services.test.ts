/**
 * Admin services 层单元测试
 *
 * 测试 listFiles、deleteFile 核心逻辑。
 * 使用 vitest + Node.js 环境，在临时文件系统中模拟文件操作。
 */

import { existsSync, mkdirSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteFile, listFiles } from '@/app/admin/services';

const TEST_DIR = path.join(__dirname, '__test_fs__');

/** 辅助：创建测试文件 */
function createFile(name: string, content: string = 'test') {
  const filePath = path.join(TEST_DIR, name);
  writeFileSync(filePath, content, 'utf-8');
}

describe('admin/services', () => {
  /** 记录原始环境变量，测试结束后恢复 */
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 创建临时测试目录
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    // 设置 DB_PATH 指向测试目录
    process.env.DB_PATH = path.join(TEST_DIR, 'app.db');
    // 创建当前数据库文件（模拟）
    createFile('app.db', 'mock-db-content');
    // 创建其他测试文件
    createFile('app.db.backup', 'mock-backup');
    createFile('notes.txt', 'some notes');
  });

  afterEach(() => {
    // 清理测试目录
    if (existsSync(TEST_DIR)) {
      const entries = readdirSync(TEST_DIR);
      for (const entry of entries) {
        unlinkSync(path.join(TEST_DIR, entry));
      }
      rmdirSync(TEST_DIR);
    }
    // 恢复环境变量
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('listFiles', () => {
    it('列出目录中所有文件，标记当前数据库', () => {
      const files = listFiles();
      // 按名称排序，先 app.db
      expect(files).toHaveLength(3);
      expect(files[0]?.name).toBe('app.db');
      expect(files[0]?.isCurrentDb).toBe(true);
      expect(files[1]?.name).toBe('app.db.backup');
      expect(files[1]?.isCurrentDb).toBe(false);
      expect(files[2]?.name).toBe('notes.txt');
    });

    it('文件大小字段包含原始值和人类可读格式', () => {
      const files = listFiles();
      for (const file of files) {
        expect(typeof file.size).toBe('number');
        expect(file.size).toBeGreaterThan(0);
        expect(typeof file.sizeDisplay).toBe('string');
        expect(file.sizeDisplay.length).toBeGreaterThan(0);
      }
    });

    it('目录不存在时返回空数组', () => {
      process.env.DB_PATH = '/nonexistent/path/app.db';
      const files = listFiles();
      expect(files).toEqual([]);
    });
  });

  describe('deleteFile', () => {
    it('删除非当前数据库文件成功', () => {
      expect(existsSync(path.join(TEST_DIR, 'app.db.backup'))).toBe(true);
      const result = deleteFile('app.db.backup');
      expect(result.success).toBe(true);
      expect(existsSync(path.join(TEST_DIR, 'app.db.backup'))).toBe(false);
    });

    it('拒绝删除当前数据库文件', () => {
      const result = deleteFile('app.db');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不能删除');
      // 文件仍然存在
      expect(existsSync(path.join(TEST_DIR, 'app.db'))).toBe(true);
    });

    it('文件不存在时返回错误', () => {
      const result = deleteFile('nonexistent.db');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  describe('formatSize', () => {
    it('通过 sizeDisplay 的格式间接验证', () => {
      // 创建不同大小的文件验证 formatSize 格式化
      const bigContent = Buffer.alloc(2048).toString(); // 2 KB
      createFile('big.db', bigContent);

      const files = listFiles();
      const bigFile = files.find((f) => f.name === 'big.db');
      expect(bigFile).toBeDefined();
      // sizeDisplay 应包含空格分隔的数值和单位
      expect(bigFile!.sizeDisplay).toMatch(/^\d+(\.\d)?\s[KMB]B?$/);
    });
  });
});
