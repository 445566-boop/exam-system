import { NextRequest, NextResponse } from "next/server";
import { getLocalDb } from "@/storage/database/local-db";
import { user } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, username, password } = body;

    if (!action || !username || !password) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const db = getLocalDb();

    if (action === "login") {
      // 登录逻辑
      const users = await db
        .select()
        .from(user)
        .where(eq(user.username, username))
        .execute();

      if (users.length === 0) {
        return NextResponse.json({ error: "用户名不存在" }, { status: 400 });
      }

      const foundUser = users[0];

      if (foundUser.password !== password) {
        return NextResponse.json({ error: "密码错误" }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: "登录成功",
        user: { id: foundUser.id, username: foundUser.username },
      });
    } else if (action === "register") {
      // 注册逻辑
      const existingUsers = await db
        .select()
        .from(user)
        .where(eq(user.username, username))
        .execute();

      if (existingUsers.length > 0) {
        return NextResponse.json({ error: "用户名已存在" }, { status: 400 });
      }

      await db.insert(user).values({ username, password }).execute();

      return NextResponse.json({
        success: true,
        message: "注册成功",
      });
    } else {
      return NextResponse.json({ error: "无效的操作" }, { status: 400 });
    }
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
