import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getLocalDb, useLocalDatabase } from "@/storage/database/local-db";
import { questionBank } from "@/storage/database/shared/schema";
import { uploadFile } from "@/lib/unified-storage";

// 统一题型名称映射
const TYPE_MAPPINGS: Record<string, string> = {
  "单选题": "单选", "单": "单选",
  "多选题": "多选", "多": "多选",
  "判断题": "判断", "判断": "判断", "是非题": "判断",
  "填空题": "填空", "填空": "填空",
  "简答题": "简答", "简答": "简答", "解答题": "简答",
};

// 规范化学科名称
function normalizeSubject(subject: string): string {
  const trimmed = subject.trim();
  const SUBJECT_LIST = [
    "语文", "数学", "英语", "物理", "化学", "生物",
    "历史", "地理", "政治", "信息技术", "通用技术", "其他"
  ];
  
  if (SUBJECT_LIST.includes(trimmed)) {
    return trimmed;
  }
  for (const s of SUBJECT_LIST) {
    if (s.includes(trimmed) || trimmed.includes(s) || s[0] === trimmed[0]) {
      return s;
    }
  }
  return trimmed || "其他";
}

// 特化解析：针对 "数字. 【题型】" 格式的题库
function parseSpecializedFormat(text: string): any[] {
  const questions: any[] = [];
  
  // 分割每道题目（以 "数字. 【题型】" 为分界点）
  const questionPattern = /(\d+)\.\s*【(.+?)】(.+?)(?=\d+\.\s*【|$)/gs;
  let match;
  
  while ((match = questionPattern.exec(text)) !== null) {
    const questionNum = match[1];
    const rawType = match[2].trim();
    const content = match[3].trim();
    
    // 规范化题型
    const type = TYPE_MAPPINGS[rawType] || rawType;
    
    // 解析题目内容
    const parsed = parseQuestionContent(content, type);
    
    if (parsed.question) {
      questions.push({
        question: parsed.question,
        answer: parsed.answer,
        type: type,
        difficulty: 1,
        options: parsed.options,
        explanation: parsed.explanation,
      });
    }
  }
  
  return questions;
}

// 解析单个题目的内容
function parseQuestionContent(content: string, type: string): {
  question: string;
  answer: string;
  options: string[] | null;
  explanation: string | null;
} {
  let question = "";
  let answer = "";
  let options: string[] | null = null;
  let explanation: string | null = null;
  
  // 提取答案
  const answerMatch = content.match(/答案[：:]\s*(.+?)(?:\n|$)/);
  if (answerMatch) {
    answer = answerMatch[1].trim();
  }
  
  // 根据题型处理
  if (type === "单选" || type === "多选") {
    // 选择题：提取题目和选项
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    const questionLines: string[] = [];
    const optionLines: string[] = [];
    
    for (const line of lines) {
      // 跳过答案行
      if (line.startsWith('答案')) continue;
      
      // 检查是否是选项行（A. B. C. D. 或 A、B、C、D、）
      const optionMatch = line.match(/^([A-F])[\.\、．]\s*(.+)$/);
      if (optionMatch) {
        optionLines.push(`${optionMatch[1]}. ${optionMatch[2].trim()}`);
      } else if (optionLines.length === 0) {
        // 还没遇到选项，这是题目内容
        questionLines.push(line);
      }
    }
    
    question = questionLines.join(' ').trim();
    options = optionLines.length > 0 ? optionLines : null;
    
  } else if (type === "判断") {
    // 判断题：题目内容（不含答案）
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    const questionLines: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('答案')) continue;
      questionLines.push(line);
    }
    
    question = questionLines.join(' ').trim();
    // 规范化答案：√ 或 × 或 对 或 错
    if (answer === "√" || answer === "对" || answer.toLowerCase() === "t" || answer === "正确") {
      answer = "正确";
    } else if (answer === "×" || answer === "错" || answer.toLowerCase() === "f" || answer === "错误") {
      answer = "错误";
    }
    
  } else if (type === "填空") {
    // 填空题：提取题目和答案
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    const questionLines: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('答案')) continue;
      questionLines.push(line);
    }
    
    question = questionLines.join(' ').trim();
    
  } else if (type === "简答") {
    // 简答题：提取题目和解析（答案作为解析）
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    const questionLines: string[] = [];
    const explanationLines: string[] = [];
    let foundAnswer = false;
    
    for (const line of lines) {
      if (line.startsWith('答案') || line.startsWith('解') || line.startsWith('证明') || line.startsWith('答')) {
        foundAnswer = true;
        explanationLines.push(line);
      } else if (foundAnswer) {
        explanationLines.push(line);
      } else {
        questionLines.push(line);
      }
    }
    
    question = questionLines.join(' ').trim();
    // 简答题的答案存为解析
    if (explanationLines.length > 0) {
      explanation = explanationLines.join('\n').trim();
      // 如果答案行为空，用解析的第一行作为答案
      if (!answer && explanationLines.length > 0) {
        answer = explanationLines[0].replace(/^(答案|解|证明|答)[：:]\s*/, '').trim() || "见解析";
      }
    }
    if (!answer) {
      answer = "见解析";
    }
  }
  
  return { question, answer, options, explanation };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const userSubject = formData.get("subject") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }

    const normalizedUserSubject = userSubject ? normalizeSubject(userSubject) : null;
    console.log(`User specified subject: ${userSubject} -> ${normalizedUserSubject}`);

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 上传文件到对象存储
    const fileKey = await uploadFile({
      fileContent: buffer,
      fileName: `question-banks/${file.name}`,
      contentType: file.type,
    });

    // 使用 mammoth 解析 Word 文档
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    const lines = text.split('\n').filter(line => line.trim());
    console.log(`Document has ${lines.length} lines`);

    // 使用特化解析（不依赖LLM）
    const allQuestions = parseSpecializedFormat(text);
    
    console.log(`Total parsed questions: ${allQuestions.length}`);

    if (allQuestions.length === 0) {
      return NextResponse.json({ error: "未能从文档中提取到题目，请检查文档格式" }, { status: 400 });
    }

    // 准备插入数据
    const questionsToInsert = allQuestions.map(q => ({
      question: q.question || "",
      answer: q.answer || "",
      type: q.type || "简答",
      difficulty: q.difficulty || 1,
      options: q.options || null,
      explanation: q.explanation || null,
      subject: normalizedUserSubject || "未分类",
    }));

    let insertedCount = 0;

    // 检查是否使用本地数据库
    if (useLocalDatabase()) {
      console.log("Using local PostgreSQL database");
      const db = getLocalDb();
      
      for (const q of questionsToInsert) {
        await db.insert(questionBank).values(q);
        insertedCount++;
        // 添加延时，模拟处理时间
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
      }
    } else {
      console.log("Using Supabase database");
      const supabase = getSupabaseClient();
      
      const supabaseData = questionsToInsert.map(q => ({
        question: q.question,
        answer: q.answer,
        type: q.type,
        difficulty: q.difficulty,
        options: q.options,
        explanation: q.explanation,
        subject: q.subject,
      }));

      const { data, error } = await supabase
        .from("question_bank")
        .insert(supabaseData)
        .select();

      if (error) {
        console.error("Database error:", error);
        return NextResponse.json({ error: "保存题目失败" }, { status: 500 });
      }
      insertedCount = data?.length || questionsToInsert.length;
    }

    // 统计各题型数量
    const typeStats: Record<string, number> = {};
    for (const q of allQuestions) {
      typeStats[q.type] = (typeStats[q.type] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      count: insertedCount,
      subject: normalizedUserSubject || "未分类",
      typeStats,
      message: `成功上传并解析 ${insertedCount} 道题目`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "上传失败，请重试", details: String(error) },
      { status: 500 }
    );
  }
}
