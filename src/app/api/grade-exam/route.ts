import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
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

    // 使用正则直接解析试卷（不依赖 LLM）
    const answers = parseExamWithRegex(text);

    console.log("Grade exam: extracted", answers.length, "answers from exam");

    if (answers.length === 0) {
      return NextResponse.json({ error: "未能从试卷中提取到题目" }, { status: 400 });
    }

    // 从题库中获取答案进行批改
    const db = getLocalDb();
    const questions = await db.select().from(questionBank).execute();

    if (!questions) {
      return NextResponse.json({ error: "获取题库失败" }, { status: 500 });
    }

    console.log("Grade exam: got", questions.length, "questions from database");

    // 匹配题目并批改
    const results: Array<{
      questionId: number;
      question: string;
      userAnswer: string;
      correctAnswer: string | null;
      isCorrect: boolean;
      type: string;
      difficulty: number | null;
      options: any;
      explanation: string | null;
      subject: string | null;
    }> = [];

    for (const answer of answers) {
      // 模糊匹配题目
      const matched = findMatchingQuestion(answer.question, questions);
      
      if (matched) {
        const userAnswer = (answer.userAnswer || "").trim();
        const correctAnswer = (matched.correctAnswer || matched.answer || "").trim();
        
        let isCorrect = false;
        
        if (matched.type === "单选" || matched.type === "多选") {
          // 选择题：比较选项（大小写不敏感）
          isCorrect = userAnswer.toUpperCase() === correctAnswer.toUpperCase();
        } else if (matched.type === "判断") {
          // 判断题：标准化答案后比较
          const normalize = (ans: string) => {
            const a = ans.toUpperCase();
            if (["对", "正确", "√", "T", "TRUE", "YES"].includes(a)) return "正确";
            if (["错", "错误", "×", "F", "FALSE", "NO"].includes(a)) return "错误";
            return a;
          };
          isCorrect = normalize(userAnswer) === normalize(correctAnswer);
        } else if (matched.type === "填空") {
          // 填空题：关键词匹配
          isCorrect = userAnswer.length > 0 && correctAnswer.includes(userAnswer);
        } else if (matched.type === "简答") {
          // 简答题：检查是否有实质内容
          isCorrect = userAnswer.length > 10;
        } else {
          isCorrect = userAnswer === correctAnswer;
        }

        results.push({
          questionId: matched.id,
          question: matched.question,
          userAnswer,
          correctAnswer,
          isCorrect,
          type: matched.type,
          difficulty: matched.difficulty,
          options: matched.options,
          explanation: matched.explanation,
          subject: matched.subject,
        });
      } else {
        // 未匹配到的题目也记录
        console.log("Grade exam: unmatched question:", answer.question.substring(0, 50));
      }
    }

    console.log("Grade exam: matched", results.length, "questions from database");

    if (results.length === 0) {
      return NextResponse.json({ error: "未能匹配到题库中的题目" }, { status: 400 });
    }

    const score = results.filter((r) => r.isCorrect).length;
    const total = results.length;

    // 保存错题到错题集
    const wrongQuestionData = results.filter((r) => !r.isCorrect);

    if (wrongQuestionData.length > 0) {
      const questionIds = wrongQuestionData.map((w) => w.questionId).filter((id) => id);
      
      const existingWrong = await db
        .select()
        .from(wrongQuestion)
        .where(inArray(wrongQuestion.questionId, questionIds))
        .execute();

      const existingMap = new Map(
        existingWrong.map((w) => [w.questionId, w.id])
      );

      const toUpdate: number[] = [];
      const toInsert: any[] = [];

      for (const wq of wrongQuestionData) {
        if (wq.questionId && existingMap.has(wq.questionId)) {
          toUpdate.push(existingMap.get(wq.questionId)!);
        } else {
          toInsert.push({
            questionId: wq.questionId,
            question: wq.question,
            userAnswer: wq.userAnswer,
            correctAnswer: wq.correctAnswer,
            type: wq.type,
            difficulty: wq.difficulty,
            options: wq.options,
            explanation: wq.explanation,
            subject: wq.subject,
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

// 正则解析试卷
function parseExamWithRegex(text: string): Array<{ question: string; userAnswer: string }> {
  const results: Array<{ question: string; userAnswer: string }> = [];
  
  // 分割题目（以 "数字. " 开头的行为新题目）
  // 格式: "1. 题目内容..."
  const questionPattern = /(\d+)\.\s+(.+?)(?=\n\d+\.\s|\n答案[：:(]|$)/gs;
  
  // 提取答案的模式
  // 格式: "答案：（ X ）" 或 "答案：（）" 或 "答案：____"
  const answerPattern = /答案[：:]\s*[（(]\s*([A-Fa-f对错正确错误√×]?)\s*[)）]/;
  const answerPattern2 = /答案[：:]\s*_{2,}/;  // 填空题横线
  const answerPattern3 = /答案[：:]\s*(.+)/;   // 其他格式
  
  // 按题目编号分割
  const lines = text.split('\n');
  let currentQuestion = "";
  let currentAnswer = "";
  let inQuestion = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 检查是否是新题目（数字. 开头）
    const questionMatch = line.match(/^(\d+)\.\s+(.+)$/);
    
    if (questionMatch) {
      // 保存上一道题
      if (currentQuestion) {
        results.push({
          question: currentQuestion.trim(),
          userAnswer: currentAnswer.trim(),
        });
      }
      
      // 开始新题目
      currentQuestion = questionMatch[2];
      currentAnswer = "";
      inQuestion = true;
      
    } else if (inQuestion) {
      // 检查是否是答案行
      if (line.startsWith('答案')) {
        const match1 = line.match(answerPattern);
        const match3 = line.match(answerPattern3);
        
        if (match1) {
          currentAnswer = match1[1].toUpperCase();
        } else if (line.match(answerPattern2)) {
          currentAnswer = "";  // 填空题未作答
        } else if (match3) {
          currentAnswer = match3[1].trim();
        }
      } else if (!line.startsWith('A.') && !line.startsWith('B.') && 
                 !line.startsWith('C.') && !line.startsWith('D.') &&
                 !line.startsWith('答案') && line.length > 0) {
        // 继续追加题目内容（排除选项和答案行）
        // 但要避免追加题型标题（如"单选题"）
        if (!line.includes('题（共') && !line.includes('题(共')) {
          currentQuestion += " " + line;
        }
      }
    }
  }
  
  // 保存最后一道题
  if (currentQuestion) {
    results.push({
      question: currentQuestion.trim(),
      userAnswer: currentAnswer.trim(),
    });
  }
  
  return results;
}

// 模糊匹配题目
function findMatchingQuestion(
  questionText: string,
  questions: any[]
): any | null {
  // 清理题目文本
  const cleanText = questionText
    .replace(/\s+/g, "")
    .replace(/[？?！!。，,；;：:]/g, "")
    .toLowerCase();
  
  // 1. 精确匹配
  let matched = questions.find(q => {
    const qText = q.question
      .replace(/\s+/g, "")
      .replace(/[？?！!。，,；;：:]/g, "")
      .toLowerCase();
    return qText === cleanText;
  });
  
  // 2. 部分匹配（题目开头）
  if (!matched) {
    const prefix = cleanText.substring(0, Math.min(30, cleanText.length));
    matched = questions.find(q => {
      const qText = q.question
        .replace(/\s+/g, "")
        .replace(/[？?！!。，,；;：:]/g, "")
        .toLowerCase();
      return qText.includes(prefix) || prefix.includes(qText.substring(0, Math.min(30, qText.length)));
    });
  }
  
  // 3. 关键词匹配
  if (!matched) {
    const keywords = cleanText.split(/[，,。、]/).filter(k => k.length >= 4);
    if (keywords.length > 0) {
      matched = questions.find(q => {
        const qText = q.question.replace(/\s+/g, "").toLowerCase();
        return keywords.some(k => qText.includes(k));
      });
    }
  }
  
  return matched || null;
}
