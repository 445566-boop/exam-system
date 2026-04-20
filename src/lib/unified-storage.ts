/**
 * 统一存储适配器
 * 根据环境变量自动选择 S3 或本地存储
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { uploadLocalFile, generateLocalDownloadUrl } from "./storage-adapter";

const USE_LOCAL = process.env.USE_LOCAL_STORAGE === 'true';

// S3 配置
const s3Config = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
};

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || '';

// 创建 S3 客户端
function getS3Client(): S3Client {
  return new S3Client(s3Config);
}

interface UploadOptions {
  fileContent: Buffer | Uint8Array;
  fileName: string;
  contentType?: string;
}

/**
 * 上传文件
 * @returns 文件访问路径或 key
 */
export async function uploadFile(options: UploadOptions): Promise<string> {
  if (USE_LOCAL) {
    const buffer = Buffer.isBuffer(options.fileContent) 
      ? options.fileContent 
      : Buffer.from(options.fileContent);
    return uploadLocalFile(
      buffer,
      options.fileName,
      options.contentType
    );
  }

  // 使用 S3 存储
  const client = getS3Client();
  const fileContent = Buffer.isBuffer(options.fileContent) 
    ? options.fileContent 
    : Buffer.from(options.fileContent);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: options.fileName,
    Body: fileContent,
    ContentType: options.contentType || 'application/octet-stream',
  });

  await client.send(command);
  return options.fileName;
}

/**
 * 生成文件下载 URL
 */
export async function generateDownloadUrl(fileKey: string): Promise<string> {
  if (USE_LOCAL) {
    return generateLocalDownloadUrl(fileKey);
  }

  // 使用 S3 预签名 URL
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileKey,
  });
  
  const downloadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
  return downloadUrl;
}
