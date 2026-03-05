"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookX, Download, Loader2, Trash2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface WrongQuestion {
  id: number;
  question: string;
  user_answer: string;
  correct_answer: string;
  type: string;
  difficulty: number;
  options?: string[];
  explanation?: string;
  count?: number;
  created_at: string;
}

export default function WrongQuestions() {
  const [questions, setQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWrongQuestions();
  }, []);

  const fetchWrongQuestions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/wrong-questions');
      if (response.ok) {
        const data = await response.json();
        setQuestions(data.questions || []);
      } else {
        setError('获取错题集失败');
      }
    } catch (err) {
      setError('网络错误，请检查连接');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch('/api/export-wrong-questions');
      if (response.ok) {
        const data = await response.json();
        // 下载文件
        const fileResponse = await fetch(data.downloadUrl);
        const blob = await fileResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `错题集_${new Date().toLocaleDateString()}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        const data = await response.json();
        setError(data.error || '导出失败');
      }
    } catch (err) {
      setError('导出失败，请重试');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/wrong-questions/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setQuestions(questions.filter(q => q.id !== id));
      }
    } catch (err) {
      setError('删除失败');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('确定要清空所有错题吗？')) return;
    
    try {
      const response = await fetch('/api/wrong-questions', {
        method: 'DELETE',
      });
      if (response.ok) {
        setQuestions([]);
      }
    } catch (err) {
      setError('清空失败');
    }
  };

  const getDifficultyLabel = (difficulty: number) => {
    const labels = { 1: '简单', 2: '中等', 3: '困难' };
    return labels[difficulty as keyof typeof labels] || '未知';
  };

  const getDifficultyColor = (difficulty: number) => {
    const colors = {
      1: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      2: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      3: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return colors[difficulty as keyof typeof colors] || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookX className="h-5 w-5" />
                错题集
              </CardTitle>
              <CardDescription>
                共 {questions.length} 道错题
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchWrongQuestions}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                disabled={questions.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                清空
              </Button>
              <Button
                size="sm"
                onClick={handleDownload}
                disabled={questions.length === 0 || downloading}
              >
                {downloading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    导出中...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    导出 Word
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 错题列表 */}
      {questions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookX className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-500">暂无错题记录</p>
            <p className="text-sm text-slate-400 mt-2">
              批改试卷后，错误的题目会自动添加到这里
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {questions.map((question, index) => (
            <Card key={question.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    {/* 标签 */}
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{question.type}</Badge>
                      <Badge className={getDifficultyColor(question.difficulty)}>
                        {getDifficultyLabel(question.difficulty)}
                      </Badge>
                      {question.count && question.count > 1 && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                          错误 {question.count} 次
                        </Badge>
                      )}
                      <span className="text-xs text-slate-400">
                        {new Date(question.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* 题目 */}
                    <p className="text-sm font-medium">
                      {index + 1}. {question.question}
                    </p>

                    {/* 选项 */}
                    {question.options && question.options.length > 0 && (
                      <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                        {question.options.map((option, optIndex) => (
                          <p key={optIndex}>{option}</p>
                        ))}
                      </div>
                    )}

                    {/* 答案对比 */}
                    <div className="flex gap-4 text-sm">
                      <span>
                        你的答案：
                        <span className="text-red-600 font-medium">
                          {question.user_answer}
                        </span>
                      </span>
                      <span>
                        正确答案：
                        <span className="text-green-600 font-medium">
                          {question.correct_answer}
                        </span>
                      </span>
                    </div>

                    {/* 解析 */}
                    {question.explanation && (
                      <div className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                        <span className="font-medium">解析：</span>
                        {question.explanation}
                      </div>
                    )}
                  </div>

                  {/* 删除按钮 */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(question.id)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
