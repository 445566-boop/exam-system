import { NextRequest, NextResponse } from "next/server";
import { getLocalFilePath, STORAGE_PATH } from "@/lib/storage-adapter";
import fs from "fs";
import path from "path";

/**
 * 本地文件下载 API
 * 
 * 使用方式：
 * GET /api/download?file=xxx.docx
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileKey = searchParams.get("file");

  if (!fileKey) {
    return NextResponse.json({ error: "缺少文件参数" }, { status: 400 });
  }

  // 安全检查：防止路径遍历攻击
  const decodedFileKey = decodeURIComponent(fileKey);
  if (decodedFileKey.includes("..") || decodedFileKey.includes("/")) {
    return NextResponse.json({ error: "无效的文件路径" }, { status: 400 });
  }

  const filePath = getLocalFilePath(decodedFileKey);

  if (!filePath) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  try {
    // 读取文件
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // 根据扩展名设置 Content-Type
    const contentTypes: { [key: string]: string } = {
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".txt": "text/plain",
    };

    const contentType = contentTypes[ext] || "application/octet-stream";

    // 返回文件
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${decodeURIComponent(fileKey)}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("文件读取失败:", error);
    return NextResponse.json({ error: "文件读取失败" }, { status: 500 });
  }
}
