"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface GradeResult {
  score: number;
  total: number;
  correct: number;
  wrong: number;
  details: Array<{
    question: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
}

export default function GradeExam() {
  const [file, setFile] = useState<File | null>(null);
  const [grading, setGrading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
      ];
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.docx') && !selectedFile.name.endsWith('.doc')) {
        setError('请上传 Word 文档（.doc 或 .docx 格式）');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleGrade = async () => {
    if (!file) return;

    setGrading(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 5, 90));
      }, 100);

      const response = await fetch('/api/grade-exam', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || '批改失败，请重试');
      }
    } catch (err) {
      setError('网络错误，请检查连接后重试');
    } finally {
      setGrading(false);
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
        setError('请上传 Word 文档（.doc 或 .docx 格式）');
        return;
      }
      setFile(droppedFile);
      setError(null);
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
            上传试卷批改
          </CardTitle>
          <CardDescription>
            上传已作答的试卷 Word 文档，系统将根据题库答案自动批改
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
              id="grade-file-upload"
            />
            <label htmlFor="grade-file-upload" className="cursor-pointer">
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
                    支持 .doc 和 .docx 格式的已作答试卷
                  </p>
                </div>
              )}
            </label>
          </div>

          {/* 作答格式说明 */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium mb-1">作答格式要求：</p>
              <ul className="text-sm space-y-1 ml-4 list-disc">
                <li>答案需标注为"答案：XXX"或"作答：XXX"</li>
                <li>选择题答案直接填写选项字母，如：答案：A</li>
                <li>判断题答案填写对/错 或 正确/错误</li>
                <li>填空题和简答题按实际内容填写</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* 进度条 */}
          {grading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>正在批改试卷...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 批改按钮 */}
          <Button
            onClick={handleGrade}
            disabled={!file || grading}
            className="w-full"
            size="lg"
          >
            {grading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在批改...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                开始批改
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 批改结果 */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              批改结果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 成绩统计 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <p className="text-3xl font-bold text-blue-600">{result.score}</p>
                <p className="text-sm text-slate-500">得分</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                <p className="text-3xl font-bold">{result.total}</p>
                <p className="text-sm text-slate-500">总题数</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
                <p className="text-3xl font-bold text-green-600">{result.correct}</p>
                <p className="text-sm text-slate-500">正确</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-red-50 dark:bg-red-950/20">
                <p className="text-3xl font-bold text-red-600">{result.wrong}</p>
                <p className="text-sm text-slate-500">错误</p>
              </div>
            </div>

            {/* 详细结果 */}
            <div className="space-y-3">
              <h3 className="font-medium">详细结果</h3>
              {result.details.map((item, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    item.isCorrect
                      ? 'border-green-200 bg-green-50 dark:bg-green-950/20'
                      : 'border-red-200 bg-red-50 dark:bg-red-950/20'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {item.isCorrect ? (
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-medium">{item.question}</p>
                      <div className="flex gap-4 text-sm">
                        <span>
                          你的答案：
                          <span className={item.isCorrect ? 'text-green-600' : 'text-red-600'}>
                            {item.userAnswer || '未作答'}
                          </span>
                        </span>
                        {!item.isCorrect && (
                          <span>
                            正确答案：
                            <span className="text-green-600">{item.correctAnswer}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
