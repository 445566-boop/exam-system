import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 从题目中提取嵌入的选项
function extractOptionsFromQuestion(question: string): { questionText: string; options: string[] } | null {
  // 方法1: 匹配选项模式：A. xxx B. xxx C. xxx D. xxx（选项间有空格分隔）
  // 使用更精确的正则，匹配到下一个选项字母或结尾
  const optionPattern1 = /([A-D])\.\s*([^A-D]+?)(?=\s*[A-D]\.|$)/g;
  
  // 方法2: 匹配更紧凑的格式，如 "A. xxx B. xxx"（选项内容可能很短）
  // 尝试按字母分割
  const optionPattern2 = /([A-D])\.\s*/g;
  
  // 先尝试方法1
  let matches = [...question.matchAll(optionPattern1)];
  
  // 如果方法1匹配少于4个选项，尝试方法2（按字母分割后重组）
  if (matches.length < 4) {
    // 找到所有选项字母的位置
    const positions: { letter: string; index: number }[] = [];
    let match;
    while ((match = optionPattern2.exec(question)) !== null) {
      positions.push({ letter: match[1], index: match.index! });
    }
    
    if (positions.length >= 2) {
      // 按位置分割选项内容
      const options: string[] = [];
      for (let i = 0; i < positions.length; i++) {
        const start = positions[i].index + positions[i].letter.length + 2; // 跳过 "A. "
        const end = i < positions.length - 1 ? positions[i + 1].index : question.length;
        const content = question.substring(start, end).trim();
        options.push(content);
      }
      
      // 提取纯题目文本
      const questionEndIndex = positions[0].index;
      const questionText = question.substring(0, questionEndIndex).trim();
      
      if (options.length >= 4 && questionText.length > 0) {
        return { questionText, options };
      }
    }
    
    return null;
  }
  
  const options: string[] = [];
  let questionEndIndex = question.length;
  
  for (const match of matches) {
    const content = match[2].trim();
    // 去除字母前缀，只保留内容
    options.push(content);
    
    // 找到第一个选项的位置作为题目结束位置
    if (match.index !== undefined && match.index < questionEndIndex) {
      questionEndIndex = match.index;
    }
  }
  
  // 提取纯题目文本
  const questionText = question.substring(0, questionEndIndex).trim();
  
  if (options.length >= 2 && questionText.length > 0) {
    return { questionText, options };
  }
  
  return null;
}

// 去除选项中的字母前缀
function cleanOptionPrefix(options: string[] | null): string[] | null {
  if (!options || options.length === 0) return options;
  
  return options.map(opt => {
    // 去除开头的字母和点/顿号，如 "A. xxx" -> "xxx" 或 "A、xxx" -> "xxx"
    return opt.replace(/^[A-Za-z][.、．]\s*/, '').trim();
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const results = {
      extractedFromQuestion: 0,
      cleanedPrefix: 0,
      errors: [] as string[],
    };

    // 1. 修复选项嵌入在题目中的单选题
    const { data: singleChoiceWithEmptyOptions, error: error1 } = await supabase
      .from("question_bank")
      .select("id, question, answer")
      .eq("type", "单选")
      .is("options", null);

    if (error1) {
      return NextResponse.json({ error: "查询失败", details: error1 }, { status: 500 });
    }

    for (const row of singleChoiceWithEmptyOptions || []) {
      const extracted = extractOptionsFromQuestion(row.question);
      if (extracted && extracted.options.length >= 4) {
        const { error: updateError } = await supabase
          .from("question_bank")
          .update({
            question: extracted.questionText,
            options: extracted.options,
          })
          .eq("id", row.id);

        if (updateError) {
          results.errors.push(`ID ${row.id} 更新失败: ${updateError.message}`);
        } else {
          results.extractedFromQuestion++;
        }
      }
    }

    // 2. 修复选项嵌入在题目中的多选题
    const { data: multiChoiceWithEmptyOptions, error: error2 } = await supabase
      .from("question_bank")
      .select("id, question, answer")
      .eq("type", "多选")
      .is("options", null);

    if (error2) {
      return NextResponse.json({ error: "查询失败", details: error2 }, { status: 500 });
    }

    for (const row of multiChoiceWithEmptyOptions || []) {
      const extracted = extractOptionsFromQuestion(row.question);
      if (extracted && extracted.options.length >= 4) {
        const { error: updateError } = await supabase
          .from("question_bank")
          .update({
            question: extracted.questionText,
            options: extracted.options,
          })
          .eq("id", row.id);

        if (updateError) {
          results.errors.push(`ID ${row.id} 更新失败: ${updateError.message}`);
        } else {
          results.extractedFromQuestion++;
        }
      }
    }

    // 3. 清理所有选项中的字母前缀
    const { data: allQuestions, error: error3 } = await supabase
      .from("question_bank")
      .select("id, options")
      .in("type", ["单选", "多选"])
      .not("options", "is", null);

    if (error3) {
      return NextResponse.json({ error: "查询失败", details: error3 }, { status: 500 });
    }

    for (const row of allQuestions || []) {
      if (!row.options || !Array.isArray(row.options)) continue;
      
      const originalStr = JSON.stringify(row.options);
      const cleanedOptions = cleanOptionPrefix(row.options);
      const cleanedStr = JSON.stringify(cleanedOptions);
      
      // 只有当选项确实被修改时才更新
      if (originalStr !== cleanedStr) {
        const { error: updateError } = await supabase
          .from("question_bank")
          .update({ options: cleanedOptions })
          .eq("id", row.id);

        if (updateError) {
          results.errors.push(`ID ${row.id} 清理前缀失败: ${updateError.message}`);
        } else {
          results.cleanedPrefix++;
        }
      }
    }

    // 4. 清理题目文本中嵌入的选项（选项已存在但题目中仍有选项文本）
    const { data: questionsWithOptions, error: error4 } = await supabase
      .from("question_bank")
      .select("id, question, options")
      .in("type", ["单选", "多选"])
      .not("options", "is", null);

    if (error4) {
      return NextResponse.json({ error: "查询失败", details: error4 }, { status: 500 });
    }

    let cleanedQuestionText = 0;
    for (const row of questionsWithOptions || []) {
      if (!row.options || !Array.isArray(row.options) || row.options.length < 4) continue;
      
      // 检查题目中是否包含选项字母
      if (/[A-D]\.\s/.test(row.question)) {
        const extracted = extractOptionsFromQuestion(row.question);
        if (extracted && extracted.questionText.length > 0) {
          // 检查提取的选项是否与现有选项匹配
          const optionsMatch = extracted.options.length === row.options.length &&
            extracted.options.every((opt, i) => 
              opt === row.options[i] || 
              opt.replace(/^[A-D]\.\s*/, '') === row.options[i]
            );
          
          if (optionsMatch || extracted.options.length >= 4) {
            const { error: updateError } = await supabase
              .from("question_bank")
              .update({ question: extracted.questionText })
              .eq("id", row.id);

            if (updateError) {
              results.errors.push(`ID ${row.id} 清理题目文本失败: ${updateError.message}`);
            } else {
              cleanedQuestionText++;
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      results: { ...results, cleanedQuestionText },
      message: `修复完成：从题目中提取 ${results.extractedFromQuestion} 条，清理前缀 ${results.cleanedPrefix} 条，清理题目文本 ${cleanedQuestionText} 条`,
    });
  } catch (error) {
    console.error("Fix error:", error);
    return NextResponse.json({ error: "修复失败", details: String(error) }, { status: 500 });
  }
}

// GET 请求用于预览需要修复的数据
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // 统计各类问题
    const { data: singleChoiceEmpty, error: error1 } = await supabase
      .from("question_bank")
      .select("id, question, answer")
      .eq("type", "单选")
      .is("options", null)
      .limit(10);

    const { data: multiChoiceEmpty, error: error2 } = await supabase
      .from("question_bank")
      .select("id, question, answer")
      .eq("type", "多选")
      .is("options", null)
      .limit(10);

    const { data: optionsWithPrefix, error: error3 } = await supabase
      .from("question_bank")
      .select("id, options")
      .in("type", ["单选", "多选"])
      .not("options", "is", null)
      .limit(10);

    // 统计数量
    const stats = {
      singleChoiceEmpty: singleChoiceEmpty?.length || 0,
      multiChoiceEmpty: multiChoiceEmpty?.length || 0,
      optionsWithPrefix: optionsWithPrefix?.filter(
        (q: { options: string[] }) => q.options?.some((opt: string) => /^[A-D][.、．]/.test(opt))
      ).length || 0,
    };

    return NextResponse.json({
      stats,
      samples: {
        singleChoiceEmpty,
        multiChoiceEmpty,
        optionsWithPrefix: optionsWithPrefix?.filter(
          (q: { options: string[] }) => q.options?.some((opt: string) => /^[A-D][.、．]/.test(opt))
        ),
      },
    });
  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json({ error: "预览失败", details: String(error) }, { status: 500 });
  }
}
