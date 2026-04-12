/**
 * 统一存储适配器
 * 根据环境变量自动选择 S3 或本地存储
 */

import { S3Storage } from "coze-coding-dev-sdk";
import { uploadLocalFile, generateLocalDownloadUrl } from "./storage-adapter";

const USE_LOCAL = process.env.USE_LOCAL_STORAGE === 'true';

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
  const storage = new S3Storage();
  const fileContent = Buffer.isBuffer(options.fileContent) 
    ? options.fileContent 
    : Buffer.from(options.fileContent);
  const fileKey = await storage.uploadFile({
    fileContent: fileContent,
    fileName: options.fileName,
    contentType: options.contentType || 'application/octet-stream',
  });
  return fileKey;
}

/**
 * 生成文件下载 URL
 */
export async function generateDownloadUrl(fileKey: string): Promise<string> {
  if (USE_LOCAL) {
    return generateLocalDownloadUrl(fileKey);
  }

  // 使用 S3 预签名 URL
  const storage = new S3Storage();
  const downloadUrl = await storage.generatePresignedUrl({
    key: fileKey,
    expireTime: 3600, // 1小时有效
  });
  return downloadUrl;
}
