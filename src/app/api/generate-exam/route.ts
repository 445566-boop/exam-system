import { NextRequest, NextResponse } from "next/server";
import { getLocalDb } from "@/storage/database/local-db";
import { questionBank, examPaper } from "@/storage/database/shared/schema";
import { uploadFile, generateDownloadUrl } from "@/lib/unified-storage";
import { inArray, eq, and } from "drizzle-orm";
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
} from "docx";

interface TypeConfig {
  type: string;
  count: number;
}

interface QuestionData {
  id: number;
  question: string;
  type: string;
  difficulty: number;
  options?: string[] | null;
  answer?: string;
  correctAnswer?: string;
  explanation?: string | null;
  subject?: string | null;
}

// 随机打乱数组
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, typeConfigs, difficulty, subject } = body as {
      title: string;
      typeConfigs: TypeConfig[];
      difficulty: string;
      subject?: string;
    };

    if (!title || !typeConfigs || typeConfigs.length === 0) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const db = getLocalDb();

    // 获取所有选中的题型
    const selectedTypes = typeConfigs.map((t) => t.type);

    // 构建查询条件
    const conditions = [inArray(questionBank.type, selectedTypes)];

    // 难度筛选
    if (difficulty !== "all" && difficulty !== "mixed") {
      conditions.push(eq(questionBank.difficulty, parseInt(difficulty)));
    }

    // 学科筛选
    if (subject && subject !== "all") {
      conditions.push(eq(questionBank.subject, subject));
      console.log(`Filtering by subject: ${subject}`);
    }

    // 查询题目
    const questions = await db
      .select()
      .from(questionBank)
      .where(and(...conditions))
      .execute();

    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: "题库中没有符合条件的题目" }, { status: 400 });
    }

    // 转换为 QuestionData 格式
    const questionData: QuestionData[] = questions.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      difficulty: q.difficulty ?? 1,
      options: q.options,
      answer: q.correctAnswer || q.answer || undefined,
      correctAnswer: q.correctAnswer || q.answer || undefined,
      explanation: q.explanation,
      subject: q.subject,
    }));

    // 记录实际筛选到的学科分布
    const subjectDistribution = questionData.reduce((acc: Record<string, number>, q) => {
      const s = q.subject || "未分类";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    // 按题型选择题目
    const selectedQuestions: QuestionData[] = [];

    for (const typeConfig of typeConfigs) {
      // 筛选该题型的所有题目
      let typeQuestions = questionData.filter((q) => q.type === typeConfig.type);

      // 如果是混合难度，按比例分配
      if (difficulty === "mixed" && typeQuestions.length > 0) {
        const easy = typeQuestions.filter((q) => q.difficulty === 1);
        const medium = typeQuestions.filter((q) => q.difficulty === 2);
        const hard = typeQuestions.filter((q) => q.difficulty === 3);

        const count = typeConfig.count;
        const easyCount = Math.ceil(count * 0.3);
        const mediumCount = Math.ceil(count * 0.5);
        const hardCount = Math.max(0, count - easyCount - mediumCount);

        const selected: QuestionData[] = [];

        selected.push(...shuffleArray(easy).slice(0, easyCount));
        selected.push(...shuffleArray(medium).slice(0, mediumCount));
        selected.push(...shuffleArray(hard).slice(0, hardCount));

        if (selected.length < count) {
          const selectedIds = new Set(selected.map((q) => q.id));
          const remaining = typeQuestions.filter((q) => !selectedIds.has(q.id));
          selected.push(...shuffleArray(remaining).slice(0, count - selected.length));
        }

        typeQuestions = selected.slice(0, count);
      } else {
        typeQuestions = shuffleArray(typeQuestions).slice(0, typeConfig.count);
      }

      selectedQuestions.push(...typeQuestions);
    }

    if (selectedQuestions.length === 0) {
      return NextResponse.json({ error: "无法选择足够的题目" }, { status: 400 });
    }

    // 检查是否有题型数量不足
    const insufficientTypes: string[] = [];
    for (const typeConfig of typeConfigs) {
      const actualCount = selectedQuestions.filter((q) => q.type === typeConfig.type).length;
      if (actualCount < typeConfig.count) {
        insufficientTypes.push(`${typeConfig.type}题(需${typeConfig.count}题，仅有${actualCount}题)`);
      }
    }

    // 生成 Word 文档
    const doc = generateExamDocument(title, selectedQuestions);
    const buffer = await Packer.toBuffer(doc);

    // 上传到存储
    const fileKey = await uploadFile({
      fileContent: buffer,
      fileName: `exams/${title}_${Date.now()}.docx`,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    // 生成下载链接
    const downloadUrl = await generateDownloadUrl(fileKey);

    // 保存试卷记录到数据库
    await db.insert(examPaper).values({
      title,
      content: {
        questions: selectedQuestions.map((q) => ({
          id: q.id,
          question: q.question,
          type: q.type,
          difficulty: q.difficulty,
          options: q.options,
        })),
      },
      config: { typeConfigs, difficulty, subject },
    }).execute();

    return NextResponse.json({
      success: true,
      downloadUrl,
      count: selectedQuestions.length,
      subject: subject || "all",
      subjectDistribution,
      warning: insufficientTypes.length > 0 ? `部分题型数量不足：${insufficientTypes.join("、")}` : undefined,
    });
  } catch (error) {
    console.error("Generate exam error:", error);
    return NextResponse.json(
      { error: "生成试卷失败" },
      { status: 500 }
    );
  }
}

// 生成试卷文档
function generateExamDocument(title: string, questions: QuestionData[]): Document {
  const sections: Paragraph[] = [];

  // 标题
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 36,
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // 信息栏
  sections.push(
    new Paragraph({
      children: [
        new TextRun({ text: "姓名：____________    学号：____________    分数：____________", size: 24 }),
      ],
      spacing: { after: 400 },
    })
  );

  // 分隔线
  sections.push(
    new Paragraph({
      children: [new TextRun({ text: "─".repeat(50), size: 24 })],
      spacing: { after: 200 },
    })
  );

  // 按题型分组
  const groupedQuestions: Record<string, QuestionData[]> = {};
  questions.forEach((q) => {
    if (!groupedQuestions[q.type]) {
      groupedQuestions[q.type] = [];
    }
    groupedQuestions[q.type].push(q);
  });

  let questionNumber = 1;

  // 按题型输出题目
  Object.entries(groupedQuestions).forEach(([type, typeQuestions]) => {
    // 题型标题
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${type}题（共${typeQuestions.length}题）`,
            bold: true,
            size: 28,
          }),
        ],
        spacing: { before: 300, after: 200 },
      })
    );

    // 题目
    typeQuestions.forEach((q) => {
      // 题目内容
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${questionNumber}. ${q.question}`,
              size: 24,
            }),
          ],
          spacing: { after: 100 },
        })
      );

      // 选项（如果有）
      if (q.options && q.options.length > 0) {
        q.options.forEach((opt) => {
          // 检查选项是否已经包含 A/B/C/D 前缀
          const hasPrefix = /^[A-F][.、．]/i.test(opt.trim());
          const displayText = hasPrefix ? opt : opt;

          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: displayText,
                  size: 24,
                }),
              ],
              indent: { left: 500 },
              spacing: { after: 50 },
            })
          );
        });
      }

      // 答题区域
      if (type === "填空") {
        // 填空题：添加答题横线
        sections.push(
          new Paragraph({
            children: [new TextRun({ text: "答案：____________________", size: 24 })],
            spacing: { before: 100, after: 200 },
          })
        );
      } else if (type === "简答") {
        // 简答题：添加答题空间
        sections.push(
          new Paragraph({
            children: [new TextRun({ text: "答案：", size: 24 })],
            spacing: { before: 100 },
          })
        );
        // 添加多行空白答题区域
        for (let i = 0; i < 4; i++) {
          sections.push(
            new Paragraph({
              children: [new TextRun({ text: "________________________________________________________________________", size: 24 })],
              spacing: { after: 100 },
            })
          );
        }
        sections.push(new Paragraph({ text: "", spacing: { after: 100 } }));
      } else if (type === "判断") {
        // 判断题：添加选择括号
        sections.push(
          new Paragraph({
            children: [new TextRun({ text: "答案：（    ）", size: 24 })],
            spacing: { before: 100, after: 200 },
          })
        );
      } else {
        // 单选/多选：添加答题括号
        sections.push(
          new Paragraph({
            children: [new TextRun({ text: "答案：（    ）", size: 24 })],
            spacing: { before: 100, after: 200 },
          })
        );
      }

      questionNumber++;
    });
  });

  return new Document({
    sections: [
      {
        children: sections,
      },
    ],
  });
}
