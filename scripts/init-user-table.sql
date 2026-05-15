-- 创建用户表
CREATE TABLE IF NOT EXISTS "user" (
  "id" SERIAL PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 插入默认管理员账号（如果不存在）
INSERT INTO "user" (username, password)
SELECT 'admin', '123456'
WHERE NOT EXISTS (SELECT 1 FROM "user" WHERE username = 'admin');
