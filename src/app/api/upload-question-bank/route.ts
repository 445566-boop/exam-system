import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "coze-coding-dev-sdk";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 上传文件到对象存储
    const storage = new S3Storage();
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: `question-banks/${file.name}`,
      contentType: file.type,
    });

    // 使用 mammoth 解析 Word 文档
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    // 使用 LLM 解析题目和答案
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const prompt = `请从以下题库文档中提取所有题目和答案，按照JSON格式返回。格式要求：
[
  {
    "question": "题目内容",
    "answer": "答案内容",
    "type": "题型（单选/多选/判断/填空/简答）",
    "difficulty": 难度等级(1-简单/2-中等/3-困难),
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "explanation": "解析说明（如果有）"
  }
]

注意：
1. 根据题目内容判断题型，选择题需要提取选项
2. 根据题目复杂度判断难度等级
3. 如果有解析说明，请提取出来
4. 只返回JSON数组，不要有其他内容

题库文档内容：
${text}`;

    // 使用流式输出获取完整响应
    const stream = client.stream([
      { role: "user", content: prompt }
    ], { temperature: 0.3 });

    // 收集完整响应
    let fullContent = "";
    for await (const chunk of stream) {
      if (chunk.content) {
        fullContent += chunk.content.toString();
      }
    }

    console.log("LLM response length:", fullContent.length);

    // 解析 LLM 返回的 JSON
    let questions;
    try {
      // 提取 JSON 部分（处理可能的 markdown 代码块）
      let content = fullContent.trim();
      if (content.startsWith("```")) {
        content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      }
      questions = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse LLM response. Content preview:", fullContent.substring(0, 500));
      return NextResponse.json({ error: "题库解析失败，请检查文档格式。LLM响应格式不正确，请重试。" }, { status: 400 });
    }

    // 验证并清理数据
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "未能从文档中提取到题目" }, { status: 400 });
    }

    // 存储到数据库
    const supabase = getSupabaseClient();
    const questionsToInsert = questions.map(q => ({
      question: q.question || "",
      answer: q.answer || "",
      type: q.type || "简答",
      difficulty: q.difficulty || 1,
      options: q.options || null,
      explanation: q.explanation || null,
      file_key: fileKey,
    }));

    const { data, error } = await supabase
      .from("question_bank")
      .insert(questionsToInsert)
      .select();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "保存题目失败" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data?.length || questions.length,
      message: `成功上传并解析 ${data?.length || questions.length} 道题目`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "上传失败，请重试" },
      { status: 500 }
    );
  }
}
