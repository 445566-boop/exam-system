import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取错题列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject");

    // 构建查询
    let query = supabase
      .from("wrong_question")
      .select("*")
      .order("created_at", { ascending: false });

    // 如果指定了学科，则筛选
    if (subject && subject !== "全部") {
      query = query.eq("subject", subject);
    }

    const { data: questions, error } = await query;

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "获取错题失败" }, { status: 500 });
    }

    // 获取所有不重复的学科列表
    const { data: subjectsData, error: subjectsError } = await supabase
      .from("wrong_question")
      .select("subject");

    // 统计每个学科的错题数量
    const subjectCounts: { [key: string]: number } = {};
    if (subjectsData) {
      subjectsData.forEach((item) => {
        const s = item.subject || "未分类";
        subjectCounts[s] = (subjectCounts[s] || 0) + 1;
      });
    }

    return NextResponse.json({ 
      questions,
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
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject");

    let query = supabase
      .from("wrong_question")
      .delete();

    // 如果指定了学科，只清空该学科的错题
    if (subject && subject !== "全部") {
      query = query.eq("subject", subject);
    } else {
      query = query.neq("id", 0); // 删除所有记录
    }

    const { error } = await query;

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "清空失败" }, { status: 500 });
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
