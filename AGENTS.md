# 智能试卷管理系统 - 开发规范

## 项目概述

基于 Next.js 的智能试卷管理系统，支持上传题库、生成试卷、批改试卷和错题集管理。

### 技术栈

- **框架**: Next.js 16 (App Router)
- **UI**: React 19, TypeScript 5, shadcn/ui
- **数据库**: Supabase (PostgreSQL)
- **存储**: S3 兼容对象存储 / 本地文件存储
- **AI**: LLM (OpenAI 兼容 API)
- **图表**: Recharts
- **文档**: docx (Word 文档生成), mammoth (Word 文档解析)

## 目录结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由
│   │   ├── upload-question-bank/   # 题库上传
│   │   ├── question-stats/          # 题库统计
│   │   ├── generate-exam/           # 试卷生成
│   │   ├── grade-exam/              # 试卷批改
│   │   ├── wrong-questions/         # 错题管理
│   │   ├── export-wrong-questions/  # 错题导出
│   │   └── download/                # 文件下载 (本地存储)
│   └── page.tsx             # 首页
├── components/             # React 组件
│   ├── generate-exam.tsx    # 生成试卷组件
│   └── wrong-questions.tsx  # 错题集组件
├── lib/                     # 工具库
│   ├── llm-adapter.ts       # LLM 适配器 (本地部署用)
│   └── storage-adapter.ts   # 存储适配器 (本地部署用)
└── storage/                 # 存储层
    └── database/            # 数据库相关
        └── shared/schema.ts # 数据库表结构
```

## 数据库表

### question_bank (题库表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| question | text | 题目内容 |
| type | text | 题型 (单选/多选/判断/填空/简答) |
| difficulty | integer | 难度 (1-3) |
| options | jsonb | 选项数组 |
| correct_answer | text | 正确答案 |
| explanation | text | 解析 |
| subject | text | 学科 |
| created_at | timestamp | 创建时间 |

### wrong_question (错题表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| question_id | integer | 关联题库ID |
| question | text | 题目内容 |
| user_answer | text | 用户答案 |
| correct_answer | text | 正确答案 |
| type | text | 题型 |
| difficulty | integer | 难度 |
| options | jsonb | 选项 |
| explanation | text | 解析 |
| subject | text | 学科 |
| count | integer | 错误次数 |
| created_at | timestamp | 创建时间 |

## API 接口

### GET /api/question-stats
获取题库统计信息

响应：
```json
{
  "total": 474,
  "types": {"单选": 124, "多选": 50, ...},
  "difficulties": {"1": 196, "2": 219, "3": 59},
  "subjects": {"生物": 474},
  "subjectDetails": {...}
}
```

### GET /api/wrong-questions
获取错题列表，支持 `subject` 参数筛选

参数：`?subject=生物`

响应：
```json
{
  "questions": [...],
  "subjects": {"生物": 5, "数学": 3}
}
```

## 本地部署

详见 [LOCAL_DEPLOYMENT.md](./LOCAL_DEPLOYMENT.md)

### 快速配置

1. 复制环境变量模板：
```bash
cp .env.local.example .env.local
```

2. 配置必要参数：
```bash
# 数据库
COZE_SUPABASE_URL=your-supabase-url
COZE_SUPABASE_ANON_KEY=your-anon-key

# LLM (必填)
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

3. 运行：
```bash
pnpm install
pnpm dev
```

## 开发规范

### 组件规范

- 使用 `"use client"` 标记客户端组件
- 使用 shadcn/ui 组件库
- 使用 Tailwind CSS 进行样式设计
- 类型定义放在组件文件顶部

### API 规范

- 使用 Next.js App Router 的 Route Handlers
- 返回统一格式的 JSON 响应
- 错误处理返回适当的 HTTP 状态码

### 数据库规范

- 使用 Drizzle ORM 进行数据库操作
- 表结构定义在 `src/storage/database/shared/schema.ts`
- 使用 Supabase JS 客户端进行数据操作

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 生产构建
pnpm build

# 类型检查
pnpm ts-check

# 代码检查
pnpm lint
```
