import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isOssConfigured, resetOssAdapter } from "@/lib/oss";

describe("lib/oss", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetOssAdapter();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("isOssConfigured", () => {
    it("returns false when no OSS vars are set", () => {
      delete process.env.OSS_ENDPOINT;
      delete process.env.OSS_SECRET_ID;
      delete process.env.OSS_SECRET_KEY;
      delete process.env.OSS_BUCKET;
      expect(isOssConfigured()).toBe(false);
    });

    it("returns false when some OSS vars are missing", () => {
      process.env.OSS_ENDPOINT = "ap-beijing";
      process.env.OSS_SECRET_ID = "secret-id";
      process.env.OSS_SECRET_KEY = "secret-key";
      delete process.env.OSS_BUCKET;
      expect(isOssConfigured()).toBe(false);
    });

    it("returns true when all OSS vars are set", () => {
      process.env.OSS_ENDPOINT = "ap-beijing";
      process.env.OSS_SECRET_ID = "secret-id";
      process.env.OSS_SECRET_KEY = "secret-key";
      process.env.OSS_BUCKET = "my-bucket";
      expect(isOssConfigured()).toBe(true);
    });
  });

  describe("getOssAdapter", () => {
    it("throws when OSS is not configured", async () => {
      delete process.env.OSS_ENDPOINT;
      delete process.env.OSS_SECRET_ID;
      delete process.env.OSS_SECRET_KEY;
      delete process.env.OSS_BUCKET;
      const { getOssAdapter } = await import("@/lib/oss");
      expect(() => getOssAdapter()).toThrow(/OSS 未配置/);
    });

    it("returns adapter with correct config when configured", async () => {
      process.env.OSS_ENDPOINT = "ap-shanghai";
      process.env.OSS_SECRET_ID = "test-id";
      process.env.OSS_SECRET_KEY = "test-key";
      process.env.OSS_BUCKET = "test-bucket";

      const { getOssAdapter } = await import("@/lib/oss");
      const adapter = getOssAdapter();
      expect(adapter.getEndpoint()).toBe("ap-shanghai");
      expect(adapter.getBucket()).toBe("test-bucket");
    });

    it("returns the same instance on repeated calls (singleton)", async () => {
      process.env.OSS_ENDPOINT = "ap-beijing";
      process.env.OSS_SECRET_ID = "test-id";
      process.env.OSS_SECRET_KEY = "test-key";
      process.env.OSS_BUCKET = "test-bucket";

      const { getOssAdapter } = await import("@/lib/oss");
      const adapter1 = getOssAdapter();
      const adapter2 = getOssAdapter();
      expect(adapter1).toBe(adapter2);
    });
  });

  describe("TencentCosAdapter", () => {
    it("lazy initializes SDK on first getSdk() call", async () => {
      process.env.OSS_ENDPOINT = "ap-beijing";
      process.env.OSS_SECRET_ID = "test-id";
      process.env.OSS_SECRET_KEY = "test-key";
      process.env.OSS_BUCKET = "test-bucket";

      const { getOssAdapter } = await import("@/lib/oss");
      const adapter = getOssAdapter();
      // SDK 应该在首次调用 getSdk() 时初始化
      const sdk = (adapter as any).getSdk();
      expect(sdk).toBeDefined();
    });

    it("has all required OssAdapter methods", async () => {
      process.env.OSS_ENDPOINT = "ap-beijing";
      process.env.OSS_SECRET_ID = "test-id";
      process.env.OSS_SECRET_KEY = "test-key";
      process.env.OSS_BUCKET = "test-bucket";

      const { getOssAdapter } = await import("@/lib/oss");
      const adapter = getOssAdapter();

      expect(typeof adapter.getEndpoint).toBe("function");
      expect(typeof adapter.setEndpoint).toBe("function");
      expect(typeof adapter.setKey).toBe("function");
      expect(typeof adapter.setSecret).toBe("function");
      expect(typeof adapter.getBucket).toBe("function");
      expect(typeof adapter.setBucket).toBe("function");
      expect(typeof adapter.exists).toBe("function");
      expect(typeof adapter.getString).toBe("function");
      expect(typeof adapter.getSignedPutUrl).toBe("function");
      expect(typeof adapter.getSignedUrl).toBe("function");
      expect(typeof adapter.putString).toBe("function");
      expect(typeof adapter.appendString).toBe("function");
      expect(typeof adapter.delete).toBe("function");
    });
  });
});
