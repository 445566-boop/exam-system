import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取错题列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    const { data: questions, error } = await supabase
      .from("wrong_question")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "获取错题失败" }, { status: 500 });
    }

    return NextResponse.json({ questions });
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

    const { error } = await supabase
      .from("wrong_question")
      .delete()
      .neq("id", 0); // 删除所有记录

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
