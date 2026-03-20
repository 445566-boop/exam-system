import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // 获取所有题目
    const { data: questions, error } = await supabase
      .from("question_bank")
      .select("type, difficulty, subject");

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "获取统计失败" }, { status: 500 });
    }

    // 统计数据
    const stats = {
      total: questions?.length || 0,
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

    questions?.forEach((q: { type: string; difficulty: number; subject: string }) => {
      // 统计题型
      stats.types[q.type] = (stats.types[q.type] || 0) + 1;
      // 统计难度
      stats.difficulties[q.difficulty] = (stats.difficulties[q.difficulty] || 0) + 1;
      // 统计学科
      const subject = q.subject || "未分类";
      stats.subjects[subject] = (stats.subjects[subject] || 0) + 1;
      // 按学科细分统计
      if (!stats.subjectDetails[subject]) {
        stats.subjectDetails[subject] = { types: {}, difficulties: {}, total: 0 };
      }
      stats.subjectDetails[subject].types[q.type] = (stats.subjectDetails[subject].types[q.type] || 0) + 1;
      stats.subjectDetails[subject].difficulties[q.difficulty] = (stats.subjectDetails[subject].difficulties[q.difficulty] || 0) + 1;
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
