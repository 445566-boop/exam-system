import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { streamLLM, extractJSON } from "@/lib/llm-adapter";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    // 使用 LLM 解析试卷答案
    const parsePrompt = `请从以下试卷中提取所有题目和用户的答案，按照JSON格式返回。格式要求：
[
  {
    "question": "题目内容",
    "userAnswer": "用户作答内容"
  }
]

注意：
1. 只返回JSON数组，不要有其他内容
2. 如果用户没有作答，userAnswer 设为空字符串

试卷内容：
${text}`;

    // 使用流式输出获取完整响应
    let parseResponseText = "";
    await streamLLM(
      [{ role: "user", content: parsePrompt }],
      (chunk) => {
        parseResponseText += chunk;
      }
    );

    // 解析 LLM 返回的 JSON
    let answers;
    try {
      const content = extractJSON(parseResponseText);
      answers = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse LLM response:", parseResponseText.substring(0, 500));
      return NextResponse.json({ error: "试卷解析失败" }, { status: 400 });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json({ error: "未能从试卷中提取到答案" }, { status: 400 });
    }

    // 从题库中获取答案进行批改
    const supabase = getSupabaseClient();
    const { data: questions, error } = await supabase
      .from("question_bank")
      .select("*");

    if (error || !questions) {
      return NextResponse.json({ error: "获取题库失败" }, { status: 500 });
    }

    // 使用 LLM 进行答案匹配和批改
    const gradePrompt = `你是一个阅卷老师，请根据以下题库答案批改用户的试卷答案。

题库（包含正确答案）：
${JSON.stringify(questions, null, 2)}

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

    // 使用流式输出获取完整响应
    let gradeResponseText = "";
    await streamLLM(
      [{ role: "user", content: gradePrompt }],
      (chunk) => {
        gradeResponseText += chunk;
      }
    );

    // 解析批改结果
    let gradeResult;
    try {
      const content = extractJSON(gradeResponseText);
      gradeResult = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse grade response:", gradeResponseText.substring(0, 500));
      return NextResponse.json({ error: "批改失败" }, { status: 500 });
    }

    // 保存错题到错题集（带去重和计数逻辑）
    const wrongQuestionData = gradeResult.results
      .filter((r: { isCorrect: boolean }) => !r.isCorrect)
      .map((r: { questionId: number; question: string; userAnswer: string; correctAnswer: string }) => {
        const originalQuestion = questions.find((q: { id: number }) => q.id === r.questionId);
        return {
          question_id: r.questionId,
          question: r.question,
          user_answer: r.userAnswer,
          correct_answer: r.correctAnswer,
          type: originalQuestion?.type || "未知",
          difficulty: originalQuestion?.difficulty || 1,
          options: originalQuestion?.options || null,
          explanation: originalQuestion?.explanation || null,
          subject: originalQuestion?.subject || null,
        };
      });

    if (wrongQuestionData.length > 0) {
      // 获取现有错题，用于去重
      const questionIds = wrongQuestionData.map((w: { question_id: number }) => w.question_id).filter((id: number) => id);
      const { data: existingWrong } = await supabase
        .from("wrong_question")
        .select("id, question_id")
        .in("question_id", questionIds);

      const existingMap = new Map(
        (existingWrong || []).map((w: { id: number; question_id: number }) => [w.question_id, w.id])
      );

      // 分离需要更新和需要插入的记录
      const toUpdate: number[] = [];
      const toInsert: any[] = [];

      for (const wq of wrongQuestionData) {
        if (wq.question_id && existingMap.has(wq.question_id)) {
          // 已存在，记录ID用于更新计数
          toUpdate.push(existingMap.get(wq.question_id)!);
        } else {
          // 不存在，插入新记录
          toInsert.push({
            ...wq,
            count: 1,
          });
        }
      }

      // 更新已有错题的计数（每次+1）
      if (toUpdate.length > 0) {
        for (const id of toUpdate) {
          try {
            await supabase.rpc("increment_wrong_count", { row_id: id });
          } catch {
            // 如果 RPC 不存在，使用普通更新
            const { data: current } = await supabase
              .from("wrong_question")
              .select("count")
              .eq("id", id)
              .single();
            await supabase
              .from("wrong_question")
              .update({ count: (current?.count || 0) + 1 })
              .eq("id", id);
          }
        }
      }

      // 插入新错题
      if (toInsert.length > 0) {
        await supabase.from("wrong_question").insert(toInsert);
      }
    }

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
      { error: "批改失败，请重试" },
      { status: 500 }
    );
  }
}
