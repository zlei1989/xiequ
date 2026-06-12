/**
 * OSS 对象存储适配器层
 *
 * 设计模式：策略 + 工厂，参考旧项目 XpnOssAdapter 接口 + TencentOss 实现。
 *
 * 接口层（OssAdapter）屏蔽底层 SDK 差异：
 * - TencentCosAdapter 基于 cos-nodejs-sdk-v5 实现（当前唯一实现）
 * - 后续如需支持阿里云 OSS，只需新增 AliOssAdapter 实现同一接口
 *
 * 工厂方法 getOssAdapter() 根据环境变量自动选择适配器并初始化。
 *
 * 环境变量：
 * - OSS_ENDPOINT: 存储区域，如 ap-beijing
 * - OSS_SECRET_ID: 密钥标识 (对应旧项目 key)
 * - OSS_SECRET_KEY: 通讯密钥 (对应旧项目 secret)
 * - OSS_BUCKET: 存储空间名称
 */

import COS from 'cos-nodejs-sdk-v5';

// ─── 适配器接口（参考 XpnOssAdapter） ────────────────────────────────────

/**
 * OSS 适配器接口
 *
 * 对应旧项目 XpnOssAdapter，方法签名保持一致。
 * 各方法语义参考 TencentOss 实现。
 */
export interface OssAdapter {
  /** 获得目标存储主机 */
  getEndpoint(): string;
  /** 设置目标存储主机 */
  setEndpoint(value: string): void;
  /** 设置身份标识 */
  setKey(value: string): void;
  /** 设置通讯密钥 */
  setSecret(value: string): void;
  /** 获得空间名称 */
  getBucket(): string;
  /** 设置空间名称 */
  setBucket(value: string): void;
  /** 判断文件是否存在 */
  exists(path: string): Promise<boolean>;
  /** 获得文件内容（字符串） */
  getString(path: string): Promise<string>;
  /** 获得上传签名 URL */
  getSignedPutUrl(path: string, options?: OssPutOptions): Promise<string>;
  /** 获得下载签名 URL */
  getSignedUrl(path: string, options?: OssPutOptions): Promise<string>;
  /** 上传字符串 */
  putString(path: string, content: string, options?: OssPutOptions): Promise<void>;
  /** 追加字符串（读-改-写，非原子操作） */
  appendString(path: string, content: string, options?: OssPutOptions): Promise<void>;
  /** 删除内容 */
  delete(path: string): Promise<void>;
}

/**
 * 上传数据选项（参考 XpnOssPutOptions）
 */
export type OssPutOptions = {
  headers?: OssPutHeaders;
};

/**
 * 上传数据头部描述（参考 XpnOssPutHeaders）
 */
export type OssPutHeaders = Record<string, string> & {
  'Cache-Control'?: string;
  'Content-Disposition'?: string;
  'Content-Encoding'?: string;
  'Content-Type'?: string;
  Expires?: string;
};

// ─── 腾讯云 COS 适配器（参考 TencentOss） ────────────────────────────────

/**
 * 腾讯云 COS 适配器
 *
 * 参考 TencentOss 实现，使用 cos-nodejs-sdk-v5。
 * https://cloud.tencent.com/document/product/436/8629
 */
export class TencentCosAdapter implements OssAdapter {
  /**
   * 目标存储主机（Region）
   */
  protected _endpoint: string = 'ap-beijing';

  /**
   * 身份标识（SecretId）
   */
  protected _key: string = '';

  /**
   * 通讯密钥（SecretKey）
   */
  protected _secret: string = '';

  /**
   * 空间名称（Bucket）
   */
  protected _bucket: string = '';

  /**
   * SDK 指针（懒初始化，参考 TencentOss._sdk）
   */
  protected _sdk?: COS;

  public getEndpoint(): string {
    return this._endpoint;
  }

  public setEndpoint(value: string): void {
    this._endpoint = value;
  }

  public setKey(value: string): void {
    this._key = value;
  }

  public setSecret(value: string): void {
    this._secret = value;
  }

  public getBucket(): string {
    return this._bucket;
  }

  public setBucket(value: string): void {
    this._bucket = value;
  }

  /**
   * 获得 SDK 指针
   *
   * 参考 TencentOss.getSdk()，懒初始化 COS 客户端。
   */
  public getSdk(): COS {
    if (!this._sdk) {
      // INFO: 关键状态变更 — 首次创建 COS 客户端实例
      console.log(`[OSS] Creating COS client (Bucket=${this._bucket}, Region=${this._endpoint})`);
      this._sdk = new COS({
        SecretId: this._key,
        SecretKey: this._secret,
        Protocol: 'https:',
      });
    }
    return this._sdk;
  }

  /**
   * 判断文件是否存在
   *
   * 参考 TencentOss.exists()，使用 headObject 探测。
   * 404 视为文件不存在（正常情况），403 及其他错误视为异常。
   */
  public exists(path: string): Promise<boolean> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      this.getSdk().headObject(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
        },
        (err: any, _ret: any) => {
          const elapsed = Date.now() - start;
          if (!_ret && err) {
            if (err.statusCode === 404) {
              // DEBUG: 文件不存在是正常查询结果，非错误
              if (elapsed > 500) console.log(`[OSS] headObject 404 (${elapsed}ms) path=${path}`);
              resolve(false);
            } else if (err.statusCode === 403) {
              // ERROR: 权限不足，打印堆栈和上下文方便排查
              console.error(`[OSS] headObject 403 (${elapsed}ms) path=${path}:`, err.message || err);
              if (err?.stack) console.error(err.stack);
              reject(err);
            } else {
              // ERROR: 其他网络或服务端错误
              console.error(`[OSS] headObject error (${elapsed}ms) path=${path} statusCode=${err.statusCode}:`, err.message || err);
              if (err?.stack) console.error(err.stack);
              reject(err);
            }
          } else {
            if (elapsed > 500) console.log(`[OSS] headObject OK (${elapsed}ms) path=${path}`);
            resolve(true);
          }
        },
      );
    });
  }

  /**
   * 获得文件内容（UTF-8 字符串）
   *
   * 参考 TencentOss.getString()。
   */
  public getString(path: string): Promise<string> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      this.getSdk().getObject(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
        },
        (err: any, ret: any) => {
          const elapsed = Date.now() - start;
          if (ret) {
            const str = ret.Body.toString('utf-8');
            if (elapsed > 500) console.log(`[OSS] getObject OK (${elapsed}ms) path=${path}`);
            resolve(str); return;
          }
          // ERROR: 下载失败，打印堆栈和上下文
          console.error(`[OSS] getObject failed (${elapsed}ms) path=${path}:`, err?.message || err);
          if (err?.stack) console.error(err.stack);
          reject(err);
        },
      );
    });
  }

  /**
   * 获得上传签名 URL
   *
   * 参考 TencentOss.getSignedPutUrl()。
   * 签名 URL 包含临时鉴权参数，客户端可直接用于 PUT 上传。
   */
  public getSignedPutUrl(
    path: string,
    options?: OssPutOptions,
  ): Promise<string> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      this.getSdk().getObjectUrl(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
          Method: 'PUT',
          Sign: true,
          Headers: options?.headers,
        },
        (err: any, ret: any) => {
          const elapsed = Date.now() - start;
          if (err) {
            // ERROR: 签名 URL 生成失败，打印堆栈和上下文
            console.error(`[OSS] getSignedPutUrl failed (${elapsed}ms) path=${path}:`, err?.message || err);
            if (err?.stack) console.error(err.stack);
            reject(err); return;
          }
          if (elapsed > 500) console.log(`[OSS] getSignedPutUrl OK (${elapsed}ms) path=${path}`);
          resolve(ret.Url);
        },
      );
    });
  }

  /**
   * 获得下载签名 URL
   *
   * 参考 TencentOss.getSignedUrl()。
   * 签名 URL 包含临时鉴权参数，客户端可直接用于 GET 下载。
   */
  public getSignedUrl(
    path: string,
    options?: OssPutOptions,
  ): Promise<string> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      this.getSdk().getObjectUrl(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
          Method: 'GET',
          Sign: true,
          Headers: options?.headers,
        },
        (err: any, ret: any) => {
          const elapsed = Date.now() - start;
          if (err) {
            // ERROR: 签名 URL 生成失败，打印堆栈和上下文
            console.error(`[OSS] getSignedUrl failed (${elapsed}ms) path=${path}:`, err?.message || err);
            if (err?.stack) console.error(err.stack);
            reject(err); return;
          }
          if (elapsed > 500) console.log(`[OSS] getSignedUrl OK (${elapsed}ms) path=${path}`);
          resolve(ret.Url);
        },
      );
    });
  }

  /**
   * 上传字符串
   *
   * 参考 TencentOss.putString()，自动设置 Content-Type 为 text/plain;charset=UTF-8。
   * 若 options.headers 中已指定 Content-Type，则使用指定值。
   */
  public putString(
    path: string,
    content: string,
    options?: OssPutOptions,
  ): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      if (!options) {
        options = {};
      }
      if (!options.headers) {
        options.headers = {};
      }
      if (!('Content-Type' in options.headers)) {
        options.headers['Content-Type'] = 'text/plain;charset=UTF-8';
      }

      this.getSdk().putObject(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
          ContentType: options.headers['Content-Type'],
          ContentEncoding: options.headers['Content-Encoding'],
          Body: content,
        },
        (err: any, _ret: any) => {
          const elapsed = Date.now() - start;
          if (err) {
            // ERROR: 上传失败，打印堆栈和上下文
            console.error(`[OSS] putObject failed (${elapsed}ms) path=${path}:`, err?.message || err);
            if (err?.stack) console.error(err.stack);
            reject(err); return;
          }
          if (elapsed > 500) console.log(`[OSS] putObject OK (${elapsed}ms) path=${path}`);
          resolve();
        },
      );
    });
  }

  /**
   * 追加字符串
   *
   * 参考 TencentOss.appendString()，非原子操作（读取旧内容 → 拼接 → 写回）。
   */
  public async appendString(
    path: string,
    content: string,
    options?: OssPutOptions,
  ): Promise<void> {
    let newContent: string;
    if (await this.exists(path)) {
      const oldContent = await this.getString(path);
      newContent = oldContent + content;
    } else {
      newContent = content;
    }
    await this.putString(path, newContent, options);
  }

  /**
   * 删除对象
   *
   * 参考 TencentOss.delete()。
   */
  public delete(path: string): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      this.getSdk().deleteObject(
        {
          Bucket: this.getBucket(),
          Region: this.getEndpoint(),
          Key: path,
        },
        (err: any, _data: any) => {
          const elapsed = Date.now() - start;
          if (err) {
            // ERROR: 删除失败，打印堆栈和上下文
            console.error(`[OSS] deleteObject failed (${elapsed}ms) path=${path}:`, err?.message || err);
            if (err?.stack) console.error(err.stack);
            reject(err); return;
          }
          if (elapsed > 500) console.log(`[OSS] deleteObject OK (${elapsed}ms) path=${path}`);
          resolve();
        },
      );
    });
  }
}

// ─── 全局单例 ──────────────────────────────────────────────────────────

let adapterInstance: OssAdapter | null = null;

/**
 * 检查 OSS 是否已配置
 *
 * 四个环境变量全部非空时视为已配置。
 */
export function isOssConfigured(): boolean {
  return (
    !!process.env.OSS_ENDPOINT &&
    !!process.env.OSS_SECRET_ID &&
    !!process.env.OSS_SECRET_KEY &&
    !!process.env.OSS_BUCKET
  );
}

/**
 * 获取 OSS 适配器单例
 *
 * 参考 XpnOss.factory() 工厂模式，根据环境变量创建适配器。
 * 当前仅支持腾讯云 COS，后续可扩展。
 */
export function getOssAdapter(): OssAdapter {
  if (adapterInstance) {
    return adapterInstance;
  }

  if (!isOssConfigured()) {
    throw new Error(
      'OSS 未配置。请设置 OSS_ENDPOINT, OSS_SECRET_ID, OSS_SECRET_KEY, OSS_BUCKET 环境变量。',
    );
  }

  // 工厂模式：参考 XpnOss.factory()，根据配置创建对应适配器
  // INFO: 关键状态变更 — 首次创建 OSS 适配器单例
  console.log(`[OSS] Creating TencentCosAdapter (Bucket=${process.env.OSS_BUCKET}, Region=${process.env.OSS_ENDPOINT})`);
  const adapter = new TencentCosAdapter();
  adapter.setEndpoint(process.env.OSS_ENDPOINT!);
  adapter.setKey(process.env.OSS_SECRET_ID!);
  adapter.setSecret(process.env.OSS_SECRET_KEY!);
  adapter.setBucket(process.env.OSS_BUCKET!);

  adapterInstance = adapter;
  return adapterInstance;
}

/**
 * 重置 OSS 适配器（主要用于测试）
 */
export function resetOssAdapter(): void {
  adapterInstance = null;
}
