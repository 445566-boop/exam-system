import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { streamLLM, extractJSON } from "@/lib/llm-adapter";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getLocalDb, useLocalDatabase } from "@/storage/database/local-db";
import { questionBank } from "@/storage/database/shared/schema";
import { uploadFile } from "@/lib/unified-storage";
import { repairAndParseJSON, normalizeQuestion } from "@/lib/json-repair";

// 统一题型名称映射
const TYPE_MAPPINGS: Record<string, string> = {
  "单选题": "单选",
  "多选题": "多选",
  "判断题": "判断",
  "填空题": "填空",
  "简答题": "简答",
};

// 规范化题型名称
function normalizeType(type: string): string {
  const trimmed = type.trim();
  return TYPE_MAPPINGS[trimmed] || trimmed;
}

// 规范化难度值（限制在1-3范围）
function normalizeDifficulty(difficulty: number): number {
  if (difficulty < 1) return 1;
  if (difficulty > 3) return Math.min(3, Math.ceil(difficulty / 3));
  return Math.round(difficulty);
}

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
  } else if (startIndex !== -1) {
    // 如果找到了 [ 但没有找到 ]，说明 JSON 被截断了
    console.log("JSON missing closing bracket, attempting to extract complete objects...");
    jsonStr = jsonStr.substring(startIndex);
    
    // 移除最后一个不完整的对象（没有闭合的）
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
    console.log("Direct parse failed, trying to extract objects individually...");
    
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

// 规范化学科名称
function normalizeSubject(subject: string): string {
  const trimmed = subject.trim();
  const SUBJECT_LIST = [
    "语文", "数学", "英语", "物理", "化学", "生物",
    "历史", "地理", "政治", "信息技术", "通用技术", "其他"
  ];
  
  // 精确匹配
  if (SUBJECT_LIST.includes(trimmed)) {
    return trimmed;
  }
  // 模糊匹配
  for (const s of SUBJECT_LIST) {
    if (s.includes(trimmed) || trimmed.includes(s) || s[0] === trimmed[0]) {
      return s;
    }
  }
  return trimmed || "其他";
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    // 获取用户指定的学科（可选参数）
    const userSubject = formData.get("subject") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }

    // 规范化用户指定的学科
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

    // 按行分割题目，估算题目数量
    const lines = text.split('\n').filter(line => line.trim());
    const estimatedQuestionCount = lines.filter(line => 
      /^\d+[.、．]/.test(line.trim()) || 
      line.includes('答案') || 
      line.includes('正确答案')
    ).length;
    
    console.log(`Document has ${lines.length} lines, estimated ${estimatedQuestionCount} questions`);

    // 分批处理，每批处理约30道题
    const BATCH_SIZE = 30;
    const allQuestions: any[] = [];
    
    // 将文本按题目分割
    const questionPattern = /(?=\d+[.、．])/g;
    const questionBlocks = text.split(questionPattern).filter(block => block.trim());
    
    console.log(`Found ${questionBlocks.length} question blocks`);
    
    // 分批处理
    for (let i = 0; i < questionBlocks.length; i += BATCH_SIZE) {
      const batch = questionBlocks.slice(i, i + BATCH_SIZE);
      const batchText = batch.join('\n\n');
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(questionBlocks.length / BATCH_SIZE);
      
      console.log(`Processing batch ${batchNum}/${totalBatches} with ${batch.length} questions`);

      // 学科处理：优先使用用户指定的学科，否则由 LLM 识别
      const subjectHint = normalizedUserSubject 
        ? `（注：本题库统一学科为【${normalizedUserSubject}】）` 
        : "";
      
      const prompt = `请从以下题库中提取题目和答案，返回紧凑的JSON数组格式（不要换行和缩进，节省token）。
格式：[{"q":"题目","a":"答案","t":"单选/多选/判断/填空/简答","d":1-3,"o":["选项1","选项2"],"s":"学科"}]

规则：
- t是题型，d是难度(1简单2中等3困难)，o是选项数组(非选择题为null)
- 学科识别：${normalizedUserSubject ? `统一设为"${normalizedUserSubject}"` : '根据题目内容判断属于哪个学科，如：语文、数学、英语、物理、化学、生物、历史、地理、政治等'}
- 只返回JSON，不要任何其他文字

题库内容：
${batchText}${subjectHint}`;

      // 使用流式输出获取完整响应
      let fullContent = "";
      await streamLLM(
        [{ role: "user", content: prompt }],
        (chunk) => {
          fullContent += chunk;
        }
      );

      // 解析 JSON
      try {
        const jsonContent = extractJSON(fullContent);
        const result = repairAndParseJSON(jsonContent);
        
        if (result.success && result.data.length > 0) {
          // 转换为完整格式并规范化
          const batchQuestions = result.data.map((q: any) => 
            normalizeQuestion(q, normalizedUserSubject || undefined)
          ).filter((q: any) => q.question && q.answer);
          
          allQuestions.push(...batchQuestions);
          console.log(`Batch ${batchNum} parsed ${batchQuestions.length} questions, total: ${allQuestions.length}`);
          
          if (result.errors.length > 0) {
            console.log(`Batch ${batchNum} warnings:`, result.errors);
          }
        } else {
          console.error(`Batch ${batchNum} parse failed:`, result.errors);
        }
      } catch (e) {
        console.error(`Batch ${batchNum} parse error:`, e);
        // 继续处理下一批
      }
    }

    console.log(`Total parsed questions: ${allQuestions.length}`);

    // 验证并清理数据
    if (allQuestions.length === 0) {
      return NextResponse.json({ error: "未能从文档中提取到题目，请检查文档格式" }, { status: 400 });
    }

    // 准备插入数据
    const questionsToInsert = allQuestions.map(q => ({
      question: q.question || "",
      answer: q.answer || "",
      type: normalizeType(q.type || "简答"),
      difficulty: normalizeDifficulty(q.difficulty || 1),
      options: q.options || null,
      explanation: q.explanation || null,
      subject: normalizedUserSubject || q.subject || "未分类",
    }));

    let insertedCount = 0;

    // 检查是否使用本地数据库
    if (useLocalDatabase()) {
      console.log("Using local PostgreSQL database");
      const db = getLocalDb();
      
      for (const q of questionsToInsert) {
        await db.insert(questionBank).values(q);
        insertedCount++;
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

    return NextResponse.json({
      success: true,
      count: insertedCount,
      subject: normalizedUserSubject || allQuestions[0]?.subject || "未分类",
      message: `成功上传并解析 ${insertedCount} 道题目${normalizedUserSubject ? `（学科：${normalizedUserSubject}）` : ""}`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "上传失败，请重试", details: String(error) },
      { status: 500 }
    );
  }
}
