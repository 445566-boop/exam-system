/**
 * 本地部署 - 文件存储适配器
 * 
 * 使用说明：
 * 1. 确保 USE_LOCAL_STORAGE=true 在 .env.local
 * 2. 确保 LOCAL_STORAGE_PATH 目录存在
 * 3. 在 API 路由中替换 S3Storage 的使用
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || './uploads';

// 确保存储目录存在
function ensureStorageDir() {
  const absolutePath = path.isAbsolute(STORAGE_PATH) 
    ? STORAGE_PATH 
    : path.join(process.cwd(), STORAGE_PATH);
  
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }
  return absolutePath;
}

/**
 * 上传文件到本地存储
 */
export async function uploadLocalFile(
  fileContent: Buffer | Uint8Array,
  fileName: string,
  _contentType?: string
): Promise<string> {
  ensureStorageDir();
  
  // 生成唯一文件名
  const ext = path.extname(fileName);
  const uniqueName = `${Date.now()}-${randomUUID()}${ext}`;
  
  const absolutePath = path.isAbsolute(STORAGE_PATH) 
    ? STORAGE_PATH 
    : path.join(process.cwd(), STORAGE_PATH);
  const filePath = path.join(absolutePath, uniqueName);
  
  // 写入文件
  const buffer = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent);
  fs.writeFileSync(filePath, buffer);
  
  // 返回文件路径（相对路径）
  return uniqueName;
}

/**
 * 生成文件下载 URL
 * 本地存储直接返回 /api/download?file=xxx
 */
export function generateLocalDownloadUrl(fileKey: string): string {
  return `/api/download?file=${encodeURIComponent(fileKey)}`;
}

/**
 * 删除文件
 */
export function deleteLocalFile(fileKey: string): boolean {
  try {
    const absolutePath = path.isAbsolute(STORAGE_PATH) 
      ? STORAGE_PATH 
      : path.join(process.cwd(), STORAGE_PATH);
    const filePath = path.join(absolutePath, fileKey);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 获取文件路径（用于 API 读取）
 */
export function getLocalFilePath(fileKey: string): string | null {
  const absolutePath = path.isAbsolute(STORAGE_PATH) 
    ? STORAGE_PATH 
    : path.join(process.cwd(), STORAGE_PATH);
  const filePath = path.join(absolutePath, fileKey);
  
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

export { STORAGE_PATH };
