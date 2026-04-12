# 智能试卷管理系统 - 本地部署指南

## 环境要求

- **Node.js**: >= 18.0.0 (推荐 20.x)
- **pnpm**: >= 9.0.0
- **PostgreSQL**: >= 14.0 (本地部署时)
- **Git**: 最新版本

## 部署方案选择

### 方案一：最小化配置（推荐测试使用）

仅替换 LLM 服务，保留云端数据库和存储：

```
✅ 数据库：使用 Supabase 云端
✅ 存储：使用 S3 云端
⚠️ LLM：替换为 OpenAI API
```

### 方案二：完全本地部署

所有服务都本地运行：

```
✅ 数据库：本地 PostgreSQL
✅ 存储：本地文件存储或 MinIO
⚠️ LLM：本地模型或 OpenAI API
```

---

## 详细部署步骤

### 第一步：克隆项目

```bash
git clone <your-repo-url> exam-system
cd exam-system
```

### 第二步：安装依赖

```bash
# 如果没有 pnpm，先安装
npm install -g pnpm

# 安装项目依赖
pnpm install
```

### 第三步：配置环境变量

```bash
# 复制环境变量模板
cp .env.local.example .env.local

# 编辑 .env.local 文件
nano .env.local  # 或使用你喜欢的编辑器
```

#### 3.1 数据库配置（必填）

**选项 A：使用 Supabase（无需修改）**

当前项目已配置 Supabase 云数据库，在沙箱环境中会自动加载凭据。

本地部署时需要：
1. 注册 [Supabase](https://supabase.com)
2. 创建新项目
3. 获取 URL 和 Anon Key
4. 填入 `.env.local`：
```
COZE_SUPABASE_URL=https://xxxx.supabase.co
COZE_SUPABASE_ANON_KEY=eyJhbGc...
```

**选项 B：使用本地 PostgreSQL**

```bash
# 安装 PostgreSQL (macOS)
brew install postgresql
brew services start postgresql

# 或使用 Docker
docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres
```

创建数据库：
```sql
CREATE DATABASE exam_system;
```

配置 `.env.local`：
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/exam_system
```

#### 3.2 LLM 服务配置（必填）

**选项 A：使用 OpenAI API（推荐）**

1. 获取 [OpenAI API Key](https://platform.openai.com/api-keys)
2. 配置 `.env.local`：
```bash
OPENAI_API_KEY=sk-xxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

**选项 B：使用 DeepSeek API（性价比高）**

1. 获取 [DeepSeek API Key](https://platform.deepseek.com/)
2. 配置 `.env.local`：
```bash
OPENAI_API_KEY=sk-xxxx
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

**选项 C：使用火山引擎（豆包）**

```bash
OPENAI_API_KEY=your-volcengine-token
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
OPENAI_MODEL=doubao-seed-1.5-25hp-sft-32k
```

#### 3.3 文件存储配置（可选）

**选项 A：使用本地文件存储**

```bash
USE_LOCAL_STORAGE=true
LOCAL_STORAGE_PATH=./uploads
mkdir -p uploads
```

**选项 B：使用 MinIO（Docker）**

```bash
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"

# 配置 .env.local
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=exam-system
```

### 第四步：初始化数据库

```bash
# 运行数据库迁移（使用 Drizzle Kit）
pnpm drizzle-kit push

# 或手动创建表
# 参考 src/storage/database/shared/schema.ts 创建表结构
```

数据库表结构 SQL：
```sql
-- 题库表
CREATE TABLE question_bank (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  type TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 1,
  options JSONB,
  correct_answer TEXT,
  explanation TEXT,
  subject TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 错题表
CREATE TABLE wrong_question (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  type TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  options JSONB,
  explanation TEXT,
  subject TEXT,
  count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 第五步：修改代码以支持本地 LLM

由于项目使用 `coze-coding-dev-sdk`，本地部署需要简单修改：

#### 修改 `src/app/api/upload-question-bank/route.ts`：

```typescript
// 原来的导入
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";

// 替换为
import { callLLM, streamLLM } from "@/lib/llm-adapter";

// 在需要调用的地方，替换为：
// 原来的流式调用
// const client = new LLMClient(config, customHeaders);
// const stream = client.stream(messages, { temperature: 0.3 });
// for await (const chunk of stream) { ... }

// 替换为：
let fullContent = '';
await streamLLM(messages, (chunk) => {
  fullContent += chunk;
});
```

#### 修改 `src/app/api/grade-exam/route.ts` 和 `src/app/api/reimport-questions/route.ts`：

同样的替换方式。

### 第六步：运行开发服务器

```bash
# 开发模式
pnpm dev

# 或生产构建
pnpm build
pnpm start
```

访问 http://localhost:3000

---

## 常见问题

### Q1: LLM 调用报错 "API key not found"

检查 `.env.local` 中的 `OPENAI_API_KEY` 是否正确设置。

### Q2: 数据库连接失败

1. 确认 PostgreSQL 服务正在运行
2. 检查 `DATABASE_URL` 格式是否正确
3. 确认数据库已创建

### Q3: 上传文件失败

1. 如果使用本地存储，确认 `uploads` 目录存在且有写入权限
2. 如果使用 S3，确认 MinIO/S3 服务正在运行

### Q4: 端口被占用

```bash
# 修改端口
PORT=3001 pnpm dev
```

---

## 功能对照表

| 功能 | 云端部署 | 本地部署 (OpenAI) | 本地部署 (完全离线) |
|------|---------|------------------|-------------------|
| 题库上传解析 | ✅ | ✅ | ⚠️ 需本地模型 |
| 学科自动识别 | ✅ | ✅ | ⚠️ 需本地模型 |
| 试卷生成 | ✅ | ✅ | ✅ |
| 试卷批改 | ✅ | ✅ | ⚠️ 需本地模型 |
| 错题集管理 | ✅ | ✅ | ✅ |
| 学科筛选统计 | ✅ | ✅ | ✅ |
| 图表可视化 | ✅ | ✅ | ✅ |

---

## 获取帮助

如有部署问题，请检查：
1. `.env.local` 配置是否完整
2. 依赖是否正确安装
3. 服务是否正常运行
