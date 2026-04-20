import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { streamLLM, extractJSON } from "@/lib/llm-adapter";
import { getSupabaseClient } from "@/storage/database/supabase-client";

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

// 规范化难度值
function normalizeDifficulty(difficulty: number): number {
  if (difficulty < 1) return 1;
  if (difficulty > 3) return Math.min(3, Math.ceil(difficulty / 3));
  return Math.round(difficulty);
}

// 尝试修复和解析 JSON
function tryParseJSON(content: string): any {
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  }

  const startIndex = jsonStr.indexOf("[");
  let endIndex = jsonStr.lastIndexOf("]");

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    jsonStr = jsonStr.substring(startIndex, endIndex + 1);
  } else if (startIndex !== -1) {
    jsonStr = jsonStr.substring(startIndex);
    let lastValidEnd = jsonStr.lastIndexOf("},");
    if (lastValidEnd !== -1) {
      jsonStr = jsonStr.substring(0, lastValidEnd + 1) + "]";
    }
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    const objects: any[] = [];
    let depth = 0;
    let startIdx = -1;

    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === "{") {
        if (depth === 0) {
          startIdx = i;
        }
        depth++;
      } else if (jsonStr[i] === "}") {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          const objStr = jsonStr.substring(startIdx, i + 1);
          try {
            const obj = JSON.parse(objStr);
            if (obj.question && obj.answer) {
              objects.push(obj);
            }
          } catch (objErr) {
            // 跳过
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

// 从题目中提取嵌入的选项
function extractOptionsFromQuestion(question: string): { questionText: string; options: string[] } | null {
  const optionPattern2 = /([A-D])\.\s*/g;
  const positions: { letter: string; index: number }[] = [];
  let match;
  while ((match = optionPattern2.exec(question)) !== null) {
    positions.push({ letter: match[1], index: match.index! });
  }

  if (positions.length >= 2) {
    const options: string[] = [];
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].index + positions[i].letter.length + 2;
      const end = i < positions.length - 1 ? positions[i + 1].index : question.length;
      const content = question.substring(start, end).trim();
      options.push(content);
    }

    const questionEndIndex = positions[0].index;
    const questionText = question.substring(0, questionEndIndex).trim();

    if (options.length >= 2 && questionText.length > 0) {
      return { questionText, options };
    }
  }

  return null;
}

// 去除选项中的字母前缀
function cleanOptionPrefix(options: string[] | null): string[] | null {
  if (!options || options.length === 0) return options;
  return options.map(opt => opt.replace(/^[A-Za-z][.、．]\s*/, "").trim());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentUrl } = body;

    if (!documentUrl) {
      return NextResponse.json({ error: "缺少文档URL" }, { status: 400 });
    }

    console.log("Downloading document from:", documentUrl);

    // 下载文档
    const response = await fetch(documentUrl);
    if (!response.ok) {
      return NextResponse.json({ error: "下载文档失败" }, { status: 400 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("Document downloaded, size:", buffer.length);

    // 解析Word文档
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    console.log("Document text extracted, length:", text.length);

    // 获取现有题目的问题文本（用于去重）
    const supabase = getSupabaseClient();
    const { data: existingQuestions } = await supabase
      .from("question_bank")
      .select("question");

    const existingSet = new Set(
      existingQuestions?.map((q: { question: string }) => q.question.trim()) || []
    );

    console.log("Existing questions count:", existingSet.size);

    // 分批处理文档内容
    const lines = text.split("\n").filter((line) => line.trim());
    const batchSize = 30;
    const allQuestions: any[] = [];

    for (let i = 0; i < lines.length; i += batchSize) {
      const batchLines = lines.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      if (batchLines.length < 5) continue;

      const batchText = batchLines.join("\n");

      console.log(`Processing batch ${batchNum}, lines: ${batchLines.length}`);

      try {
        // 使用流式输出获取完整响应
        let fullContent = "";
        await streamLLM(
          [
            {
              role: "system",
              content: `你是一个专业的题目解析助手。请从给定的文本中提取所有题目，包括选择题、判断题、填空题和简答题。

对于每道题目，提取以下信息：
- q: 题目内容（选择题只包含题干，不要包含选项）
- a: 答案（选择题填字母A/B/C/D，判断题填"正确"或"错误"，填空题填答案，简答题填答案要点）
- t: 题型（单选/多选/判断/填空/简答）
- d: 难度（1-3）
- o: 选项数组（仅选择题需要，格式为["选项1内容","选项2内容","选项3内容","选项4内容"]，不要包含字母前缀）
- s: 学科（根据题目内容判断，如：语文、数学、英语、物理、化学、生物、历史、地理、政治等）

重要规则：
1. 选择题选项内容不要包含A、B、C、D等字母前缀
2. 选项内容要完整，不要截断
3. 如果题目已经包含选项，请将选项分离到o字段中
4. 根据题目内容准确判断学科归属

请以紧凑的JSON数组格式返回，不要有换行和空格。`,
            },
            {
              role: "user",
              content: `请解析以下文本中的题目，返回JSON数组格式：
[{"q":"题目","a":"答案","t":"题型","d":1,"o":["选项1","选项2","选项3","选项4"],"s":"学科"}]

文本内容：
${batchText}`,
            },
          ],
          (chunk) => {
            fullContent += chunk;
          }
        );

        console.log(`Batch ${batchNum} response length:`, fullContent.length);

        const parsed = tryParseJSON(extractJSON(fullContent));
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.q && item.a) {
              // 处理选项
              let options = item.o || null;
              if (options && Array.isArray(options)) {
                options = cleanOptionPrefix(options);
              }

              // 检查题目是否包含嵌入的选项
              let questionText = item.q;
              if ((item.t === "单选" || item.t === "多选") && /[A-D]\.\s/.test(questionText)) {
                const extracted = extractOptionsFromQuestion(questionText);
                if (extracted) {
                  questionText = extracted.questionText;
                  if (!options || options.length < 4) {
                    options = extracted.options;
                  }
                }
              }

              allQuestions.push({
                question: questionText,
                answer: item.a,
                type: normalizeType(item.t || "简答"),
                difficulty: normalizeDifficulty(item.d || 1),
                options: options,
                subject: item.s || "未分类",
              });
            }
          }
        }
      } catch (e) {
        console.error(`Batch ${batchNum} parse error:`, e);
      }
    }

    console.log(`Total parsed questions: ${allQuestions.length}`);

    // 过滤重复题目
    const newQuestions = allQuestions.filter((q) => {
      const normalizedQuestion = q.question.trim();
      // 检查是否已存在
      if (existingSet.has(normalizedQuestion)) {
        return false;
      }
      existingSet.add(normalizedQuestion);
      return true;
    });

    console.log(`New questions after deduplication: ${newQuestions.length}`);

    if (newQuestions.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "没有发现新题目（所有题目已存在）",
      });
    }

    // 插入新题目
    const questionsToInsert = newQuestions.map((q) => ({
      question: q.question,
      answer: q.answer,
      type: q.type,
      difficulty: q.difficulty,
      options: q.options,
      subject: q.subject || "未分类",
    }));

    const { data, error } = await supabase
      .from("question_bank")
      .insert(questionsToInsert)
      .select();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "保存题目失败", details: error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data?.length || newQuestions.length,
      total: allQuestions.length,
      duplicates: allQuestions.length - newQuestions.length,
      message: `成功导入 ${data?.length || newQuestions.length} 道新题目（过滤 ${allQuestions.length - newQuestions.length} 道重复）`,
    });
  } catch (error) {
    console.error("Reimport error:", error);
    return NextResponse.json({ error: "导入失败", details: String(error) }, { status: 500 });
  }
}
