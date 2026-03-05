import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "coze-coding-dev-sdk";

// 尝试修复和解析 JSON
function tryParseJSON(content: string): any {
  // 移除 markdown 代码块标记
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  }
  
  // 尝试找到 JSON 数组的开始和结束
  const startIndex = jsonStr.indexOf("[");
  let endIndex = jsonStr.lastIndexOf("]");
  
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    jsonStr = jsonStr.substring(startIndex, endIndex + 1);
  } else if (startIndex !== -1 && endIndex === -1) {
    // 如果找到了 [ 但没有找到 ]，尝试补全
    console.log("JSON missing closing bracket, attempting to fix...");
    jsonStr = jsonStr.substring(startIndex);
    
    // 移除最后一个可能的逗号和不完整的对象
    let lastValidEnd = jsonStr.lastIndexOf("},");
    if (lastValidEnd !== -1) {
      jsonStr = jsonStr.substring(0, lastValidEnd + 1) + "]";
    } else {
      // 尝试找到最后一个完整的对象
      lastValidEnd = jsonStr.lastIndexOf("}");
      if (lastValidEnd !== -1) {
        jsonStr = jsonStr.substring(0, lastValidEnd + 1) + "]";
      }
    }
  }
  
  // 直接解析
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // 如果仍然失败，尝试逐个对象解析
    console.log("Direct parse failed, trying to extract objects...");
    
    const objects: any[] = [];
    // 使用更简单的方式提取对象
    let depth = 0;
    let startIdx = -1;
    
    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === '{') {
        if (depth === 0) {
          startIdx = i;
        }
        depth++;
      } else if (jsonStr[i] === '}') {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          const objStr = jsonStr.substring(startIdx, i + 1);
          try {
            const obj = JSON.parse(objStr);
            if (obj.question && obj.answer) {
              objects.push(obj);
            }
          } catch (objErr) {
            // 跳过无法解析的对象
          }
          startIdx = -1;
        }
      }
    }
    
    if (objects.length > 0) {
      return objects;
    }
    
    throw e;
  }
}

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

重要提示：
1. 根据题目内容判断题型，选择题需要提取选项
2. 根据题目复杂度判断难度等级
3. 只返回JSON数组，不要有任何其他文字说明
4. 确保JSON格式正确，每个对象之间用逗号分隔，最后一个对象后面不要有逗号
5. 数组必须用]闭合

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
    console.log("LLM response start (300 chars):", fullContent.substring(0, 300));
    console.log("LLM response end (300 chars):", fullContent.substring(Math.max(0, fullContent.length - 300)));

    // 解析 LLM 返回的 JSON
    let questions;
    try {
      questions = tryParseJSON(fullContent);
    } catch (e) {
      console.error("JSON parse error:", e);
      return NextResponse.json({ 
        error: "题库解析失败，LLM响应格式不正确，请重试", 
        details: String(e),
        contentLength: fullContent.length,
        contentStart: fullContent.substring(0, 300),
        contentEnd: fullContent.substring(Math.max(0, fullContent.length - 300))
      }, { status: 400 });
    }

    // 验证并清理数据
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ 
        error: "未能从文档中提取到题目",
        contentLength: fullContent.length 
      }, { status: 400 });
    }

    console.log("Successfully parsed", questions.length, "questions");

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
      { error: "上传失败，请重试", details: String(error) },
      { status: 500 }
    );
  }
}
