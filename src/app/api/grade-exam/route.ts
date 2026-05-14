import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { streamLLM, parseJSONWithRepair } from "@/lib/llm-adapter";
import { getLocalDb } from "@/storage/database/local-db";
import { questionBank, wrongQuestion } from "@/storage/database/shared/schema";
import { inArray, eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }

    console.log("Grade exam: file received, size =", file.size);

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    console.log("Grade exam: text extracted, length =", text.length);

    // 使用 LLM 解析试卷答案
    const parsePrompt = `请从以下试卷中提取所有题目和用户的答案。

【输入试卷内容】
${text}

【输出格式要求】
返回JSON数组，每个元素包含：
- question: 题目内容（字符串，只保留题目主干，不要包含选项）
- userAnswer: 用户作答内容（字符串，未作答则为空字符串""）

【示例输出】
[
  {"question": "植物进行光合作用的场所是？", "userAnswer": "A"},
  {"question": "人体最大的器官是？", "userAnswer": ""},
  {"question": "简述光合作用的意义。", "userAnswer": "光合作用可以为植物提供有机物..."}
]

【注意事项】
1. 只返回JSON数组，不要有任何其他文字
2. 确保JSON格式正确，字段名必须是 "question" 和 "userAnswer"
3. 如果用户没有作答，userAnswer 必须是空字符串 ""
4. 题目内容只保留题目主干，不要包含选项内容`;

    console.log("Grade exam: calling LLM to parse answers...");

    // 使用流式输出获取完整响应
    let parseResponseText = "";
    try {
      await streamLLM(
        [{ role: "user", content: parsePrompt }],
        (chunk) => {
          parseResponseText += chunk;
        }
      );
    } catch (llmError) {
      console.error("Grade exam: LLM call failed:", llmError);
      return NextResponse.json({ error: `LLM 调用失败: ${String(llmError)}` }, { status: 500 });
    }

    console.log("Grade exam: LLM response received, length =", parseResponseText.length);

    // 解析 LLM 返回的 JSON（带修复功能）
    let answers;
    try {
      answers = parseJSONWithRepair(parseResponseText);
    } catch (e) {
      console.error("Failed to parse LLM response:", parseResponseText.substring(0, 500));
      return NextResponse.json({ error: "试卷解析失败，请检查试卷格式" }, { status: 400 });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json({ error: "未能从试卷中提取到答案" }, { status: 400 });
    }

    console.log("Grade exam: extracted", answers.length, "answers from exam");

    // 从题库中获取答案进行批改
    const db = getLocalDb();
    const questions = await db.select().from(questionBank).execute();

    if (!questions) {
      return NextResponse.json({ error: "获取题库失败" }, { status: 500 });
    }

    console.log("Grade exam: got", questions.length, "questions from database");

    // 本地匹配题目，只提取相关的题目
    const matchedQuestions: Array<{
      id: number;
      question: string;
      type: string;
      difficulty: number | null;
      options: any;
      correctAnswer: string | null;
      explanation: string | null;
      subject: string | null;
      userAnswer: string;
    }> = [];

    for (const answer of answers) {
      // 尝试匹配题目（模糊匹配）
      const questionText = answer.question.replace(/\s+/g, "").toLowerCase();
      
      // 先尝试精确匹配
      let matched = questions.find(q => 
        q.question.replace(/\s+/g, "").toLowerCase() === questionText
      );
      
      // 如果精确匹配失败，尝试部分匹配（题目开头）
      if (!matched) {
        matched = questions.find(q => 
          q.question.replace(/\s+/g, "").toLowerCase().includes(questionText.substring(0, Math.min(20, questionText.length)))
        );
      }
      
      // 如果还是匹配失败，尝试反向匹配
      if (!matched) {
        matched = questions.find(q => 
          questionText.includes(q.question.replace(/\s+/g, "").toLowerCase().substring(0, Math.min(20, q.question.length)))
        );
      }

      if (matched) {
        matchedQuestions.push({
          id: matched.id,
          question: matched.question,
          type: matched.type,
          difficulty: matched.difficulty,
          options: matched.options,
          correctAnswer: matched.correctAnswer || matched.answer,
          explanation: matched.explanation,
          subject: matched.subject,
          userAnswer: answer.userAnswer || "",
        });
      }
    }

    console.log("Grade exam: matched", matchedQuestions.length, "questions from database");

    if (matchedQuestions.length === 0) {
      return NextResponse.json({ error: "未能匹配到题库中的题目" }, { status: 400 });
    }

    // 本地批改（不再使用 LLM 批改，避免输出过长）
    const results = matchedQuestions.map((q) => {
      const userAnswer = (q.userAnswer || "").trim().toUpperCase();
      const correctAnswer = (q.correctAnswer || "").trim().toUpperCase();
      
      let isCorrect = false;
      
      if (q.type === "单选" || q.type === "多选") {
        // 选择题：比较选项
        isCorrect = userAnswer === correctAnswer;
      } else if (q.type === "判断") {
        // 判断题：标准化答案后比较
        const normalizeAnswer = (ans: string) => {
          if (["对", "正确", "√", "T", "TRUE", "YES"].includes(ans.toUpperCase())) return "正确";
          if (["错", "错误", "×", "F", "FALSE", "NO"].includes(ans.toUpperCase())) return "错误";
          return ans;
        };
        isCorrect = normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer);
      } else if (q.type === "填空") {
        // 填空题：关键词匹配
        isCorrect = userAnswer.length > 0 && correctAnswer.includes(userAnswer);
      } else if (q.type === "简答") {
        // 简答题：检查是否有实质内容
        isCorrect = userAnswer.length > 10;
      } else {
        // 其他类型：直接比较
        isCorrect = userAnswer === correctAnswer;
      }

      return {
        questionId: q.id,
        question: q.question,
        userAnswer: q.userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        type: q.type,
        difficulty: q.difficulty,
        options: q.options,
        explanation: q.explanation,
        subject: q.subject,
      };
    });

    const score = results.filter((r) => r.isCorrect).length;
    const total = results.length;

    // 保存错题到错题集（带去重和计数逻辑）
    const wrongQuestionData = results
      .filter((r) => !r.isCorrect)
      .map((r) => ({
        questionId: r.questionId,
        question: r.question,
        userAnswer: r.userAnswer,
        correctAnswer: r.correctAnswer,
        type: r.type,
        difficulty: r.difficulty,
        options: r.options,
        explanation: r.explanation,
        subject: r.subject,
      }));

    if (wrongQuestionData.length > 0) {
      // 获取现有错题，用于去重
      const questionIds = wrongQuestionData.map((w) => w.questionId).filter((id) => id);
      
      const existingWrong = await db
        .select()
        .from(wrongQuestion)
        .where(inArray(wrongQuestion.questionId, questionIds))
        .execute();

      const existingMap = new Map(
        existingWrong.map((w) => [w.questionId, w.id])
      );

      // 分离需要更新和需要插入的记录
      const toUpdate: number[] = [];
      const toInsert: any[] = [];

      for (const wq of wrongQuestionData) {
        if (wq.questionId && existingMap.has(wq.questionId)) {
          toUpdate.push(existingMap.get(wq.questionId)!);
        } else {
          toInsert.push({
            ...wq,
            count: 1,
          });
        }
      }

      // 更新已有错题的计数
      if (toUpdate.length > 0) {
        for (const id of toUpdate) {
          const current = await db
            .select({ count: wrongQuestion.count })
            .from(wrongQuestion)
            .where(eq(wrongQuestion.id, id))
            .execute();
          
          const newCount = (current[0]?.count || 0) + 1;
          
          await db
            .update(wrongQuestion)
            .set({ count: newCount })
            .where(eq(wrongQuestion.id, id))
            .execute();
        }
      }

      // 插入新错题
      if (toInsert.length > 0) {
        await db.insert(wrongQuestion).values(toInsert).execute();
      }
    }

    console.log("Grade exam: completed, score =", score, "/", total);

    return NextResponse.json({
      score,
      total,
      correct: score,
      wrong: wrongQuestionData.length,
      details: results.map((r) => ({
        question: r.question,
        userAnswer: r.userAnswer,
        correctAnswer: r.correctAnswer,
        isCorrect: r.isCorrect,
      })),
    });
  } catch (error) {
    console.error("Grade exam error:", error);
    return NextResponse.json(
      { error: "批改失败，请重试", details: String(error) },
      { status: 500 }
    );
  }
}
