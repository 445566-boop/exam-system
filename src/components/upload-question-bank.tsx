"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface UploadResult {
  success: boolean;
  message: string;
  count?: number;
}

export default function UploadQuestionBank() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // 验证文件类型
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/msword', // .doc
      ];
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.docx') && !selectedFile.name.endsWith('.doc')) {
        setResult({
          success: false,
          message: '请上传 Word 文档（.doc 或 .docx 格式）',
        });
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // 模拟进度
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch('/api/upload-question-bank', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: `成功上传并解析题库，共 ${data.count || 0} 道题目`,
          count: data.count,
        });
      } else {
        setResult({
          success: false,
          message: data.error || '上传失败，请重试',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: '网络错误，请检查连接后重试',
      });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
      ];
      if (!validTypes.includes(droppedFile.type) && !droppedFile.name.endsWith('.docx') && !droppedFile.name.endsWith('.doc')) {
        setResult({
          success: false,
          message: '请上传 Word 文档（.doc 或 .docx 格式）',
        });
        return;
      }
      setFile(droppedFile);
      setResult(null);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            上传题库文件
          </CardTitle>
          <CardDescription>
            上传包含题目和答案的 Word 文档，系统将自动解析并存储题目
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 上传区域 */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              file ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              type="file"
              accept=".doc,.docx"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              {file ? (
                <div className="space-y-2">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    点击更换文件
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <FileText className="h-12 w-12 text-slate-400 mx-auto" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    点击或拖拽文件到此处上传
                  </p>
                  <p className="text-xs text-slate-500">
                    支持 .doc 和 .docx 格式的 Word 文档
                  </p>
                </div>
              )}
            </label>
          </div>

          {/* 格式说明 */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium mb-1">文档格式要求：</p>
              <ul className="text-sm space-y-1 ml-4 list-disc">
                <li>题目需按序号排列，如：1. 题目内容</li>
                <li>答案可标注为"答案：XXX"或"正确答案：XXX"</li>
                <li>选择题选项建议使用 A. B. C. D. 格式</li>
                <li>建议标注题型（单选、多选、判断、填空、简答）</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* 进度条 */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>正在上传并解析...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* 结果提示 */}
          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              {result.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {result.message}
              </AlertDescription>
            </Alert>
          )}

          {/* 上传按钮 */}
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full"
            size="lg"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在上传...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                开始上传
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
