import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { S3Storage } from "coze-coding-dev-sdk";
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
} from "docx";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // 获取所有错题
    const { data: questions, error } = await supabase
      .from("wrong_question")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: "获取错题失败" }, { status: 500 });
    }

    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: "暂无错题可导出" }, { status: 400 });
    }

    // 生成 Word 文档
    const doc = await generateWrongQuestionsDocument(questions);
    const buffer = await Packer.toBuffer(doc);

    // 上传到对象存储
    const storage = new S3Storage();
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: `wrong-questions/错题集_${Date.now()}.docx`,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    // 生成下载链接
    const downloadUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 3600, // 1小时有效
    });

    return NextResponse.json({ downloadUrl });
  } catch (error) {
    console.error("Export wrong questions error:", error);
    return NextResponse.json(
      { error: "导出失败" },
      { status: 500 }
    );
  }
}

// 生成错题集文档
async function generateWrongQuestionsDocument(questions: any[]) {
  const sections: Paragraph[] = [];

  // 标题
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "错题集",
          bold: true,
          size: 36,
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // 统计信息
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `共 ${questions.length} 道错题`,
          size: 24,
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
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
  const groupedQuestions: { [key: string]: typeof questions } = {};
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
      // 题目内容（包含错误次数）
      const countText = q.count && q.count > 1 ? `（错误${q.count}次）` : '';
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${questionNumber}. ${q.question}${countText}`,
              size: 24,
            }),
          ],
          spacing: { after: 100 },
        })
      );

      // 选项（如果有）
      if (q.options && q.options.length > 0) {
        q.options.forEach((option: string, index: number) => {
          const letter = String.fromCharCode(65 + index);
          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${letter}. ${option}`,
                  size: 24,
                }),
              ],
              indent: { left: 400 },
              spacing: { after: 50 },
            })
          );
        });
      }

      // 答案对比
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `你的答案：${q.user_answer}`,
              size: 24,
              color: "FF0000",
            }),
          ],
          spacing: { after: 50 },
        })
      );

      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `正确答案：${q.correct_answer}`,
              size: 24,
              color: "008000",
            }),
          ],
          spacing: { after: 100 },
        })
      );

      // 解析（如果有）
      if (q.explanation) {
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `解析：${q.explanation}`,
                size: 24,
                italics: true,
                color: "666666",
              }),
            ],
            spacing: { after: 200 },
          })
        );
      }

      // 分隔线
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: "─".repeat(30), size: 24, color: "CCCCCC" })],
          spacing: { after: 200 },
        })
      );

      questionNumber++;
    });
  });

  // 创建文档
  const doc = new Document({
    sections: [
      {
        children: sections,
      },
    ],
  });

  return doc;
}
