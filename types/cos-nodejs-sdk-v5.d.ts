/**
 * 腾讯云 COS SDK (cos-nodejs-sdk-v5) TypeScript 类型声明
 *
 * 为该库提供最小类型覆盖，屏蔽 JS SDK 无类型的问题。
 * 只声明项目中实际使用的接口和方法，非完整 SDK 类型。
 *
 * 注意：本文件仅为类型声明，无运行时逻辑，日志由调用方（lib/oss.ts）负责。
 *
 * @see https://cloud.tencent.com/document/product/436/8629
 */

declare module 'cos-nodejs-sdk-v5' {
  /**
   * COS 客户端初始化配置
   *
   * 对应 SDK new COS(options) 的参数。
   */
  interface COSOptions {
    /** 密钥标识（SecretId） */
    SecretId: string;
    /** 通讯密钥（SecretKey） */
    SecretKey: string;
    /** 传输协议，默认 "https:" */
    Protocol?: string;
  }

  /** getObject 请求参数 — 下载对象 */
  interface GetObjectParams {
    /** 存储桶名称，格式 test-1250000000 */
    Bucket: string;
    /** 存储桶所在地域 */
    Region: string;
    /** 对象键（文件路径） */
    Key: string;
  }

  /** putObject 请求参数 — 上传对象 */
  interface PutObjectParams {
    /** 存储桶名称 */
    Bucket: string;
    /** 存储桶所在地域 */
    Region: string;
    /** 对象键（文件路径） */
    Key: string;
    /** 文件内容，支持字符串或 Buffer */
    Body: string | Buffer;
    /** 内容类型（对应 HTTP Content-Type 头） */
    ContentType?: string;
    /** 内容编码（对应 HTTP Content-Encoding 头） */
    ContentEncoding?: string;
  }

  /** deleteObject 请求参数 — 删除对象 */
  interface DeleteObjectParams {
    /** 存储桶名称 */
    Bucket: string;
    /** 存储桶所在地域 */
    Region: string;
    /** 对象键（文件路径） */
    Key: string;
  }

  /** headObject 请求参数 — 查询对象元数据，常用来判断文件是否存在 */
  interface HeadObjectParams {
    /** 存储桶名称 */
    Bucket: string;
    /** 存储桶所在地域 */
    Region: string;
    /** 对象键（文件路径） */
    Key: string;
  }

  /** getObjectUrl 请求参数 — 生成带签名的对象访问 URL */
  interface GetObjectUrlParams {
    /** 存储桶名称 */
    Bucket: string;
    /** 存储桶所在地域 */
    Region: string;
    /** 对象键（文件路径） */
    Key: string;
    /** HTTP 方法，如 "GET"、"PUT" */
    Method: string;
    /** 是否生成签名 URL */
    Sign: boolean;
    /** 签名中携带的 HTTP 请求头 */
    Headers?: Record<string, string>;
  }

  // 第三方 SDK 类型声明，回调参数类型由 COS 文档定义
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type COSCallback = (err: any, data: any) => void;

  /**
   * 腾讯云 COS 客户端
   *
   * 封装对腾讯云对象存储的 RESTful API 调用。
   * 项目中通过 TencentCosAdapter（lib/oss.ts）间接使用，不直接实例化。
   */
  class COS {
    /** 初始化客户端，传入密钥和协议配置 */
    constructor(options: COSOptions);
    /** 下载对象内容 */
    getObject(params: GetObjectParams, callback: COSCallback): void;
    /** 上传对象 */
    putObject(params: PutObjectParams, callback: COSCallback): void;
    /** 删除对象 */
    deleteObject(params: DeleteObjectParams, callback: COSCallback): void;
    /** 查询对象元数据（常用于 exists 探测） */
    headObject(params: HeadObjectParams, callback: COSCallback): void;
    /** 生成带签名的对象访问 URL */
    getObjectUrl(params: GetObjectUrlParams, callback: COSCallback): void;
  }

  export = COS;
}
