declare module "cos-nodejs-sdk-v5" {
  interface COSOptions {
    SecretId: string;
    SecretKey: string;
    Protocol?: string;
  }

  interface GetObjectParams {
    Bucket: string;
    Region: string;
    Key: string;
  }

  interface PutObjectParams {
    Bucket: string;
    Region: string;
    Key: string;
    Body: string | Buffer;
    ContentType?: string;
    ContentEncoding?: string;
  }

  interface DeleteObjectParams {
    Bucket: string;
    Region: string;
    Key: string;
  }

  interface HeadObjectParams {
    Bucket: string;
    Region: string;
    Key: string;
  }

  interface GetObjectUrlParams {
    Bucket: string;
    Region: string;
    Key: string;
    Method: string;
    Sign: boolean;
    Headers?: Record<string, string>;
  }

  type COSCallback = (err: any, data: any) => void;

  class COS {
    constructor(options: COSOptions);
    getObject(params: GetObjectParams, callback: COSCallback): void;
    putObject(params: PutObjectParams, callback: COSCallback): void;
    deleteObject(params: DeleteObjectParams, callback: COSCallback): void;
    headObject(params: HeadObjectParams, callback: COSCallback): void;
    getObjectUrl(params: GetObjectUrlParams, callback: COSCallback): void;
  }

  export = COS;
}
