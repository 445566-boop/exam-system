import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { streamLLM, parseJSONWithRepair } from "@/lib/llm-adapter";
import { getLocalDb } from "@/storage/database/local-db";
import { questionBank, wrongQuestion } from "@/storage/database/shared/schema";
import { inArray, eq, sql } from "drizzle-orm";

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
- question: 题目内容（字符串）
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
4. 题目内容要完整提取，不要遗漏`;

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

    // 从题库中获取答案进行批改
    const db = getLocalDb();
    const questions = await db.select().from(questionBank).execute();

    if (!questions) {
      return NextResponse.json({ error: "获取题库失败" }, { status: 500 });
    }

    console.log("Grade exam: got", questions.length, "questions from database");

    // 转换为带正确答案的格式
    const questionsWithAnswers = questions.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      difficulty: q.difficulty,
      options: q.options,
      correctAnswer: q.correctAnswer || q.answer,
      explanation: q.explanation,
      subject: q.subject,
    }));

    // 使用 LLM 进行答案匹配和批改
    const gradePrompt = `你是一个阅卷老师，请根据以下题库答案批改用户的试卷答案。

题库（包含正确答案）：
${JSON.stringify(questionsWithAnswers, null, 2)}

用户答案：
${JSON.stringify(answers, null, 2)}

请按以下JSON格式返回批改结果：
{
  "results": [
    {
      "question": "题目内容",
      "userAnswer": "用户答案",
      "correctAnswer": "正确答案",
      "isCorrect": true/false,
      "questionId": 题目ID（从题库中匹配）
    }
  ],
  "score": 得分,
  "total": 总题数
}

注意：
1. 对于选择题，判断用户答案是否与正确答案一致（忽略大小写和空格）
2. 对于判断题，"对"/"正确"/"√" 都算正确，"错"/"错误"/"×" 都算错误
3. 对于填空题和简答题，判断关键词是否匹配
4. 只返回JSON，不要有其他内容`;

    console.log("Grade exam: calling LLM to grade...");

    // 使用流式输出获取完整响应
    let gradeResponseText = "";
    try {
      await streamLLM(
        [{ role: "user", content: gradePrompt }],
        (chunk) => {
          gradeResponseText += chunk;
        }
      );
    } catch (llmError) {
      console.error("Grade exam: LLM grading failed:", llmError);
      return NextResponse.json({ error: `批改失败: ${String(llmError)}` }, { status: 500 });
    }

    console.log("Grade exam: grading response received, length =", gradeResponseText.length);

    // 解析批改结果（带修复功能）
    let gradeResult;
    try {
      gradeResult = parseJSONWithRepair(gradeResponseText);
    } catch (e) {
      console.error("Failed to parse grade response:", gradeResponseText.substring(0, 500));
      return NextResponse.json({ error: "批改失败，请重试" }, { status: 500 });
    }

    // 保存错题到错题集（带去重和计数逻辑）
    const wrongQuestionData = gradeResult.results
      .filter((r: { isCorrect: boolean }) => !r.isCorrect)
      .map((r: { questionId: number; question: string; userAnswer: string; correctAnswer: string }) => {
        const originalQuestion = questions.find((q) => q.id === r.questionId);
        return {
          questionId: r.questionId,
          question: r.question,
          userAnswer: r.userAnswer,
          correctAnswer: r.correctAnswer,
          type: originalQuestion?.type || "未知",
          difficulty: originalQuestion?.difficulty || 1,
          options: originalQuestion?.options || null,
          explanation: originalQuestion?.explanation || null,
          subject: originalQuestion?.subject || null,
        };
      });

    if (wrongQuestionData.length > 0) {
      // 获取现有错题，用于去重
      const questionIds = wrongQuestionData.map((w: { questionId: number }) => w.questionId).filter((id: number) => id);
      
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

    console.log("Grade exam: completed, score =", gradeResult.score);

    return NextResponse.json({
      score: gradeResult.score,
      total: gradeResult.total,
      correct: gradeResult.results.filter((r: { isCorrect: boolean }) => r.isCorrect).length,
      wrong: wrongQuestionData.length,
      details: gradeResult.results.map((r: { question: string; userAnswer: string; correctAnswer: string; isCorrect: boolean }) => ({
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
