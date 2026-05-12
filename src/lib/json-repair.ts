/**
 * JSON 修复和解析工具
 * 用于处理 LLM 返回的不规范 JSON
 */

interface ParseResult {
  success: boolean;
  data: any[];
  errors: string[];
}

/**
 * 尝试修复和解析 JSON
 */
export function repairAndParseJSON(content: string): ParseResult {
  const errors: string[] = [];
  let jsonStr = content.trim();
  
  // 1. 移除 markdown 代码块标记
  jsonStr = jsonStr.replace(/```json\n?/gi, "").replace(/```\n?/g, "");
  
  // 2. 尝试找到 JSON 数组的开始和结束
  const startIndex = jsonStr.indexOf("[");
  let endIndex = jsonStr.lastIndexOf("]");
  
  if (startIndex === -1) {
    // 没有找到数组，尝试找对象
    const objStart = jsonStr.indexOf("{");
    const objEnd = jsonStr.lastIndexOf("}");
    if (objStart !== -1 && objEnd !== -1) {
      // 单个对象，包装成数组
      jsonStr = "[" + jsonStr.substring(objStart, objEnd + 1) + "]";
    } else {
      return { success: false, data: [], errors: ["No JSON array or object found"] };
    }
  } else if (endIndex === -1 || endIndex < startIndex) {
    // JSON 被截断，尝试修复
    jsonStr = repairTruncatedJSON(jsonStr, startIndex);
    errors.push("JSON was truncated, attempted repair");
  } else {
    jsonStr = jsonStr.substring(startIndex, endIndex + 1);
  }
  
  // 3. 尝试直接解析
  try {
    const parsed = JSON.parse(jsonStr);
    return { success: true, data: Array.isArray(parsed) ? parsed : [parsed], errors };
  } catch (e) {
    errors.push(`Direct parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // 4. 尝试修复常见问题后解析
  try {
    const repaired = repairCommonIssues(jsonStr);
    const parsed = JSON.parse(repaired);
    return { success: true, data: Array.isArray(parsed) ? parsed : [parsed], errors };
  } catch (e) {
    errors.push(`Repair parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // 5. 逐个对象提取
  const objects = extractObjects(jsonStr);
  if (objects.length > 0) {
    errors.push(`Extracted ${objects.length} objects individually`);
    return { success: true, data: objects, errors };
  }
  
  return { success: false, data: [], errors: [...errors, "Failed to extract any valid objects"] };
}

/**
 * 修复截断的 JSON
 */
function repairTruncatedJSON(jsonStr: string, startIndex: number): string {
  let str = jsonStr.substring(startIndex);
  
  // 找到最后一个完整的对象
  const lastValidEnd = findLastCompleteObject(str);
  if (lastValidEnd !== -1) {
    str = str.substring(0, lastValidEnd + 1) + "]";
  } else {
    // 完全没有完整对象
    str = "[]";
  }
  
  return str;
}

/**
 * 找到最后一个完整的 JSON 对象
 */
function findLastCompleteObject(str: string): number {
  let depth = 0;
  let lastCompleteEnd = -1;
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          lastCompleteEnd = i;
        }
      }
    }
  }
  
  return lastCompleteEnd;
}

/**
 * 修复常见的 JSON 问题
 */
function repairCommonIssues(jsonStr: string): string {
  let repaired = jsonStr;
  
  // 1. 修复未转义的引号（简单处理）
  // 这个比较复杂，暂时跳过
  
  // 2. 修复中文标点
  repaired = repaired
    .replace(/：/g, ':')
    .replace(/，/g, ',')
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'")
    .replace(/【/g, '[')
    .replace(/】/g, ']')
    .replace(/｛/g, '{')
    .replace(/｝/g, '}')
    .replace(/（/g, '(')
    .replace(/）/g, ')');
  
  // 3. 移除控制字符
  repaired = repaired.replace(/[\x00-\x1F\x7F]/g, (char) => {
    if (char === '\n' || char === '\r' || char === '\t') return char;
    return '';
  });
  
  // 4. 修复尾随逗号
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
  
  // 5. 修复缺失的逗号（对象之间）
  // repaired = repaired.replace(/\}\s*\{/g, '},{');
  
  return repaired;
}

/**
 * 逐个提取 JSON 对象
 */
function extractObjects(jsonStr: string): any[] {
  const objects: any[] = [];
  let depth = 0;
  let startIdx = -1;
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        if (depth === 0) {
          startIdx = i;
        }
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          const objStr = jsonStr.substring(startIdx, i + 1);
          try {
            // 尝试修复后解析
            let fixed = objStr;
            // 修复中文标点
            fixed = fixed
              .replace(/：/g, ':')
              .replace(/，/g, ',')
              .replace(/"/g, '"')
              .replace(/"/g, '"');
            // 修复尾随逗号
            fixed = fixed.replace(/,(\s*})/g, '$1');
            
            const obj = JSON.parse(fixed);
            // 验证是否有有效字段
            if (obj.q || obj.question || obj.a || obj.answer) {
              objects.push(obj);
            }
          } catch (objErr) {
            // 跳过无法解析的对象
            console.log(`Failed to parse object: ${objStr.substring(0, 100)}...`);
          }
          startIdx = -1;
        }
      }
    }
  }
  
  return objects;
}

/**
 * 规范化题目对象
 */
export function normalizeQuestion(q: any, defaultSubject?: string): {
  question: string;
  answer: string;
  type: string;
  difficulty: number;
  options: string[] | null;
  explanation: string | null;
  subject: string;
} {
  // 题型映射
  const TYPE_MAP: Record<string, string> = {
    "单选题": "单选",
    "多选题": "多选", 
    "判断题": "判断",
    "填空题": "填空",
    "简答题": "简答",
  };
  
  const rawType = (q.t || q.type || "简答").trim();
  const type = TYPE_MAP[rawType] || rawType;
  
  // 难度规范化 (1-3)
  let difficulty = q.d || q.difficulty || 1;
  if (difficulty < 1) difficulty = 1;
  if (difficulty > 3) difficulty = Math.min(3, Math.ceil(difficulty / 3));
  difficulty = Math.round(difficulty);
  
  // 选项处理
  let options = q.o || q.options || null;
  if (options && !Array.isArray(options)) {
    // 如果选项是字符串，尝试解析
    if (typeof options === 'string') {
      try {
        options = JSON.parse(options);
      } catch {
        options = null;
      }
    }
  }
  
  return {
    question: (q.q || q.question || "").toString().trim(),
    answer: (q.a || q.answer || "").toString().trim(),
    type,
    difficulty,
    options: Array.isArray(options) ? options : null,
    explanation: q.e || q.explanation || null,
    subject: (q.s || q.subject || defaultSubject || "未分类").toString().trim(),
  };
}
