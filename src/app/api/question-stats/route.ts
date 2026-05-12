import { NextRequest, NextResponse } from "next/server";
import { getLocalDb } from "@/storage/database/local-db";
import { questionBank } from "@/storage/database/shared/schema";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const db = getLocalDb();

    // 获取所有题目的统计信息
    const questions = await db
      .select({
        type: questionBank.type,
        difficulty: questionBank.difficulty,
        subject: questionBank.subject,
      })
      .from(questionBank)
      .execute();

    // 统计数据
    const stats = {
      total: questions.length || 0,
      types: {} as { [key: string]: number },
      difficulties: {} as { [key: number]: number },
      subjects: {} as { [key: string]: number },
      // 按学科细分统计
      subjectDetails: {} as { 
        [subject: string]: { 
          types: { [key: string]: number }; 
          difficulties: { [key: number]: number };
          total: number 
        } 
      },
    };

    questions?.forEach((q) => {
      // 统计题型
      stats.types[q.type] = (stats.types[q.type] || 0) + 1;
      // 统计难度
      const diff = q.difficulty ?? 1;
      stats.difficulties[diff] = (stats.difficulties[diff] || 0) + 1;
      // 统计学科
      const subject = q.subject || "未分类";
      stats.subjects[subject] = (stats.subjects[subject] || 0) + 1;
      // 按学科细分统计
      if (!stats.subjectDetails[subject]) {
        stats.subjectDetails[subject] = { types: {}, difficulties: {}, total: 0 };
      }
      stats.subjectDetails[subject].types[q.type] = (stats.subjectDetails[subject].types[q.type] || 0) + 1;
      stats.subjectDetails[subject].difficulties[diff] = (stats.subjectDetails[subject].difficulties[diff] || 0) + 1;
      stats.subjectDetails[subject].total++;
    });

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "获取统计失败" },
      { status: 500 }
    );
  }
}
