import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // 获取所有题目
    const { data: questions, error } = await supabase
      .from("question_bank")
      .select("type, difficulty");

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "获取统计失败" }, { status: 500 });
    }

    // 统计数据
    const stats = {
      total: questions?.length || 0,
      types: {} as { [key: string]: number },
      difficulties: {} as { [key: number]: number },
    };

    questions?.forEach((q: { type: string; difficulty: number }) => {
      // 统计题型
      stats.types[q.type] = (stats.types[q.type] || 0) + 1;
      // 统计难度
      stats.difficulties[q.difficulty] = (stats.difficulties[q.difficulty] || 0) + 1;
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
