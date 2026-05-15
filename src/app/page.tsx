"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, CheckSquare, BookX, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import UploadQuestionBank from "@/components/upload-question-bank";
import GenerateExam from "@/components/generate-exam";
import GradeExam from "@/components/grade-exam";
import WrongQuestions from "@/components/wrong-questions";

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("upload");
  const [isChecking, setIsChecking] = useState(true);

  // 检查登录状态
  useEffect(() => {
    const isLoggedIn = localStorage.getItem("isLoggedIn");
    if (isLoggedIn !== "true") {
      router.push("/login");
    } else {
      setIsChecking(false);
    }
  }, [router]);

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("username");
    router.push("/login");
  };

  // 加载中状态
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-slate-600">验证登录状态...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-blue-950">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="container mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              智能试卷管理系统——22050815陆铮杰
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              上传题库、生成试卷、自动批改、错题管理一站式解决
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">上传题库</span>
              <span className="sm:hidden">上传</span>
            </TabsTrigger>
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">生成试卷</span>
              <span className="sm:hidden">生成</span>
            </TabsTrigger>
            <TabsTrigger value="grade" className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline">批改试卷</span>
              <span className="sm:hidden">批改</span>
            </TabsTrigger>
            <TabsTrigger value="wrong" className="flex items-center gap-2">
              <BookX className="h-4 w-4" />
              <span className="hidden sm:inline">错题集</span>
              <span className="sm:hidden">错题</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <UploadQuestionBank />
          </TabsContent>

          <TabsContent value="generate">
            <GenerateExam />
          </TabsContent>

          <TabsContent value="grade">
            <GradeExam />
          </TabsContent>

          <TabsContent value="wrong">
            <WrongQuestions />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
