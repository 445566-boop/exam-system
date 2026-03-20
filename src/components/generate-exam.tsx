"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Loader2, Download, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface QuestionStats {
  total: number;
  types: { [key: string]: number };
  difficulties: { [key: number]: number };
  subjects: { [key: string]: number };
  subjectDetails: { [subject: string]: { types: { [key: string]: number }; total: number } };
}

interface TypeConfig {
  id: string;
  label: string;
  selected: boolean;
  count: number;
}

export default function GenerateExam() {
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // 每种题型的配置（是否选择、数量）
  const [typeConfigs, setTypeConfigs] = useState<TypeConfig[]>([
    { id: "单选", label: "单选题", selected: false, count: 5 },
    { id: "多选", label: "多选题", selected: false, count: 5 },
    { id: "判断", label: "判断题", selected: false, count: 5 },
    { id: "填空", label: "填空题", selected: false, count: 5 },
    { id: "简答", label: "简答题", selected: false, count: 3 },
  ]);

  // 获取题库统计信息
  useEffect(() => {
    fetchQuestionStats();
  }, []);

  const fetchQuestionStats = async () => {
    try {
      const response = await fetch('/api/question-stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const difficultyOptions = [
    { value: "all", label: "全部难度" },
    { value: "1", label: "简单" },
    { value: "2", label: "中等" },
    { value: "3", label: "困难" },
    { value: "mixed", label: "混合（简单:中等:困难 = 3:5:2）" },
  ];

  // 切换题型选择状态
  const handleTypeToggle = (typeId: string, checked: boolean) => {
    setTypeConfigs(prev => 
      prev.map(config => 
        config.id === typeId ? { ...config, selected: checked } : config
      )
    );
  };

  // 修改题型数量
  const handleCountChange = (typeId: string, count: number) => {
    setTypeConfigs(prev => 
      prev.map(config => 
        config.id === typeId ? { ...config, count: Math.max(1, count) } : config
      )
    );
  };

  // 计算总题目数
  const totalCount = typeConfigs
    .filter(c => c.selected)
    .reduce((sum, c) => sum + c.count, 0);

  // 获取选中的题型配置
  const getSelectedTypes = () => {
    return typeConfigs.filter(c => c.selected);
  };

  const handleGenerate = async () => {
    if (!title.trim()) {
      setError("请输入试卷标题");
      return;
    }
    
    const selectedTypes = getSelectedTypes();
    if (selectedTypes.length === 0) {
      setError("请至少选择一种题型");
      return;
    }

    setGenerating(true);
    setError(null);
    setDownloadUrl(null);
    setWarning(null);

    try {
      const response = await fetch('/api/generate-exam', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          typeConfigs: selectedTypes.map(t => ({
            type: t.id,
            count: t.count,
          })),
          difficulty,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setDownloadUrl(data.downloadUrl);
        if (data.warning) {
          setWarning(data.warning);
        }
      } else {
        setError(data.error || '生成失败，请重试');
      }
    } catch (err) {
      setError('网络错误，请检查连接后重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadUrl) return;

    setDownloading(true);
    try {
      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('下载失败，请重试');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 题库统计 */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">题库统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-slate-500">总题数</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-2">题型分布</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.types).map(([type, count]) => (
                    <Badge key={type} variant="secondary">
                      {type}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-2">难度分布</p>
                <div className="flex gap-2">
                  <Badge>简单: {stats.difficulties[1] || 0}</Badge>
                  <Badge>中等: {stats.difficulties[2] || 0}</Badge>
                  <Badge>困难: {stats.difficulties[3] || 0}</Badge>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-2">学科分布</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.subjects).map(([subject, count]) => (
                    <Badge key={subject} variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400">
                      {subject}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            
            {/* 按学科细分统计 */}
            {Object.keys(stats.subjectDetails).length > 1 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-slate-500 mb-3">学科细分统计</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(stats.subjectDetails).map(([subject, detail]) => (
                    <div key={subject} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-purple-600 dark:text-purple-400">{subject}</span>
                        <Badge variant="secondary">共 {detail.total} 题</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 text-xs">
                        {Object.entries(detail.types).map(([type, count]) => (
                          <Badge key={type} variant="outline" className="text-xs">
                            {type}: {count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 生成配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            生成试卷配置
          </CardTitle>
          <CardDescription>
            选择题目类型并设置每种题型的数量，系统将随机生成试卷
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 试卷标题 */}
          <div className="space-y-2">
            <Label htmlFor="title">试卷标题</Label>
            <Input
              id="title"
              placeholder="例如：数学期中考试试卷"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* 题型选择与数量设置 */}
          <div className="space-y-2">
            <Label>题目类型与数量</Label>
            <div className="border rounded-lg divide-y">
              {typeConfigs.map((typeConfig) => {
                const availableCount = stats?.types[typeConfig.id] || 0;
                const isOverLimit = typeConfig.selected && typeConfig.count > availableCount;
                
                return (
                  <div 
                    key={typeConfig.id} 
                    className={`flex items-center justify-between p-4 ${
                      typeConfig.selected ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={typeConfig.id}
                        checked={typeConfig.selected}
                        onCheckedChange={(checked) => handleTypeToggle(typeConfig.id, checked as boolean)}
                        disabled={availableCount === 0}
                      />
                      <label
                        htmlFor={typeConfig.id}
                        className={`text-sm font-medium leading-none ${
                          availableCount === 0 ? 'text-slate-400 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        {typeConfig.label}
                      </label>
                      <Badge variant="outline" className="text-xs">
                        题库: {availableCount}题
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-slate-500">数量:</Label>
                      <Input
                        type="number"
                        min="1"
                        max={availableCount}
                        value={typeConfig.count}
                        onChange={(e) => handleCountChange(typeConfig.id, parseInt(e.target.value) || 1)}
                        disabled={!typeConfig.selected || availableCount === 0}
                        className={`w-20 ${isOverLimit ? 'border-red-500' : ''}`}
                      />
                      {isOverLimit && (
                        <span className="text-xs text-red-500">
                          超出可用数量
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* 总题数显示 */}
            <div className="flex justify-end mt-2">
              <Badge variant="secondary" className="text-sm">
                总计: {totalCount} 题
              </Badge>
            </div>
          </div>

          {/* 难度选择 */}
          <div className="space-y-2">
            <Label>题目难度</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-full md:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {difficultyOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 错误提示 */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 警告提示 */}
          {warning && (
            <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-400">
                {warning}
              </AlertDescription>
            </Alert>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-4">
            <Button
              onClick={handleGenerate}
              disabled={generating || !stats || stats.total === 0 || totalCount === 0}
              size="lg"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在生成...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  生成试卷
                </>
              )}
            </Button>

            {downloadUrl && (
              <Button
                onClick={handleDownload}
                disabled={downloading}
                variant="outline"
                size="lg"
              >
                {downloading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    下载中...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    下载试卷
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
