import { NextRequest, NextResponse } from "next/server";
import { getLocalDb } from "@/storage/database/local-db";
import { wrongQuestion } from "@/storage/database/shared/schema";
import { eq, sql, ne } from "drizzle-orm";

// 获取错题列表
export async function GET(request: NextRequest) {
  try {
    const db = getLocalDb();
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject");

    // 构建查询
    let query = db
      .select()
      .from(wrongQuestion)
      .orderBy(sql`${wrongQuestion.createdAt} DESC`);

    // 如果指定了学科，则筛选
    if (subject && subject !== "全部") {
      query = db
        .select()
        .from(wrongQuestion)
        .where(eq(wrongQuestion.subject, subject))
        .orderBy(sql`${wrongQuestion.createdAt} DESC`);
    }

    const questions = await query.execute();

    // 获取所有学科列表及数量
    const subjectsData = await db
      .select({ subject: wrongQuestion.subject, count: sql<number>`count(*)` })
      .from(wrongQuestion)
      .groupBy(wrongQuestion.subject)
      .execute();

    // 统计每个学科的错题数量
    const subjectCounts: { [key: string]: number } = {};
    subjectsData.forEach((item) => {
      const s = item.subject || "未分类";
      subjectCounts[s] = Number(item.count);
    });

    // 转换字段名为前端期望的下划线格式
    const formattedQuestions = questions.map((q) => ({
      id: q.id,
      question: q.question,
      user_answer: q.userAnswer,
      correct_answer: q.correctAnswer,
      type: q.type,
      difficulty: q.difficulty,
      options: q.options,
      explanation: q.explanation,
      subject: q.subject,
      count: q.count,
      created_at: q.createdAt,
    }));

    return NextResponse.json({ 
      questions: formattedQuestions,
      subjects: subjectCounts
    });
  } catch (error) {
    console.error("Get wrong questions error:", error);
    return NextResponse.json(
      { error: "获取错题失败" },
      { status: 500 }
    );
  }
}

// 清空所有错题
export async function DELETE(request: NextRequest) {
  try {
    const db = getLocalDb();
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject");

    if (subject && subject !== "全部") {
      // 只清空该学科的错题
      await db.delete(wrongQuestion).where(eq(wrongQuestion.subject, subject)).execute();
    } else {
      // 删除所有记录
      await db.delete(wrongQuestion).execute();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clear wrong questions error:", error);
    return NextResponse.json(
      { error: "清空失败" },
      { status: 500 }
    );
  }
}
