/**
 * LLM 适配器 - 使用 OpenAI 兼容 API（支持 DeepSeek、OpenAI 等）
 * 
 * 使用说明：
 * 1. 配置 .env.local 中的 OPENAI_API_KEY、OPENAI_BASE_URL、OPENAI_MODEL
 * 2. DeepSeek: OPENAI_BASE_URL=https://api.deepseek.com/v1, OPENAI_MODEL=deepseek-chat
 * 3. OpenAI: OPENAI_BASE_URL=https://api.openai.com/v1, OPENAI_MODEL=gpt-4o-mini
 */

import axios from 'axios';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 从环境变量读取配置
const getApiKey = () => process.env.OPENAI_API_KEY || process.env.COZE_LOOP_API_TOKEN || '';
const getBaseUrl = () => process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
const getDefaultModel = () => process.env.OPENAI_MODEL || 'deepseek-chat';

/**
 * 流式调用 LLM
 */
export async function streamLLM(
  messages: LLMMessage[],
  onChunk: (content: string) => void,
  options?: { model?: string; temperature?: number }
): Promise<string> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();
  const model = options?.model || getDefaultModel();
  const temperature = options?.temperature ?? 0.3;

  if (!apiKey) {
    throw new Error('请配置 OPENAI_API_KEY 环境变量');
  }

  const response = await axios({
    method: 'POST',
    url: `${baseUrl}/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    data: {
      model,
      messages,
      temperature,
      stream: true,
    },
    responseType: 'stream',
  });

  return new Promise((resolve, reject) => {
    let fullContent = '';
    
    response.data.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              onChunk(content);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    });

    response.data.on('end', () => resolve(fullContent));
    response.data.on('error', reject);
  });
}

/**
 * 非流式调用 LLM
 */
export async function callLLM(
  messages: LLMMessage[],
  options?: { model?: string; temperature?: number }
): Promise<string> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();
  const model = options?.model || getDefaultModel();
  const temperature = options?.temperature ?? 0.3;

  if (!apiKey) {
    throw new Error('请配置 OPENAI_API_KEY 环境变量');
  }

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages,
      temperature,
      stream: false,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  );

  return response.data.choices?.[0]?.message?.content || '';
}

/**
 * 从 LLM 响应中提取 JSON
 */
export function extractJSON(text: string): string {
  // 移除 markdown 代码块标记
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  
  // 尝试找到 JSON 数组或对象
  const jsonMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) {
    cleaned = jsonMatch[1];
  }
  
  return cleaned.trim();
}

/**
 * 修复常见的 JSON 格式错误
 */
export function repairJSON(text: string): string {
  let repaired = text;
  
  // 修复字段名不一致的问题 (Answer -> userAnswer)
  repaired = repaired.replace(/"Answer"\s*:/g, '"userAnswer":');
  repaired = repaired.replace(/"answer"\s*:/g, '"userAnswer":');
  
  // 修复字段名后多余的空格 (如 "question " -> "question")
  repaired = repaired.replace(/"(\w+)"\s*:/g, '"$1":');
  
  // 修复缺少引号的字段名
  repaired = repaired.replace(/\{\s*([^"]\w+)\s*:/g, '{"$1":');
  repaired = repaired.replace(/,\s*([^"]\w+)\s*:/g, ',"$1":');
  
  // 修复缺少的逗号
  repaired = repaired.replace(/\}\s*\{/g, '},{');
  repaired = repaired.replace(/"\s*\{/g, '",{');
  repaired = repaired.replace(/\}\s*"/g, '},"');
  
  // 修复不完整的字符串值 (如 "correctAnswer": " 后面没有闭合)
  // 找到所有不完整的字符串并补全
  repaired = repaired.replace(/"([^"]+)":\s*"[^"]*$/gm, '"$1": ""');
  
  // 修复被截断的对象 (如缺少闭合的 } )
  // 找到最后一个看起来完整的对象
  const objectPattern = /\{\s*"question"\s*:[^}]*"userAnswer"\s*:[^}]*\}/g;
  const matches = repaired.match(objectPattern);
  
  if (matches && matches.length > 0) {
    // 尝试重建数组
    const validObjects: string[] = [];
    let tempText = repaired;
    
    // 提取所有能匹配的完整对象
    let match;
    const regex = /\{\s*"question"\s*:\s*"[^"]*"[^}]*"userAnswer"\s*:\s*"[^"]*"[^}]*\}/g;
    while ((match = regex.exec(tempText)) !== null) {
      validObjects.push(match[0]);
    }
    
    if (validObjects.length > 0) {
      // 如果原始是数组格式，返回数组
      if (repaired.trim().startsWith('[') || repaired.includes('"results"')) {
        // 检查是否有 results 包装
        if (repaired.includes('"results"')) {
          return JSON.stringify({ results: validObjects.map(o => JSON.parse(o)), score: 0, total: validObjects.length });
        }
        return '[' + validObjects.join(',') + ']';
      }
    }
  }
  
  // 修复缺少的右括号/右方括号
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  
  // 补充缺少的闭合符号
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}';
  }
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']';
  }
  
  // 尝试移除末尾不完整的部分
  // 找到最后一个完整的对象
  const lastCompleteObject = repaired.lastIndexOf('"}');
  if (lastCompleteObject > 0 && lastCompleteObject < repaired.length - 2) {
    // 检查是否在数组中
    const trimmed = repaired.substring(0, lastCompleteObject + 2);
    // 确保数组正确闭合
    if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
      return trimmed + ']';
    }
    return trimmed;
  }
  
  return repaired;
}

/**
 * 尝试解析 JSON，带有修复功能
 */
export function parseJSONWithRepair(text: string): any {
  const extracted = extractJSON(text);
  
  try {
    return JSON.parse(extracted);
  } catch (e) {
    // 尝试修复后解析
    const repaired = repairJSON(extracted);
    try {
      return JSON.parse(repaired);
    } catch (e2) {
      // 最后尝试：逐个对象解析
      try {
        // 对于数组，尝试逐个解析元素
        if (repaired.startsWith('[')) {
          const items: any[] = [];
          // 使用正则匹配每个对象 - 更宽松的匹配
          const objectRegex = /\{\s*"question"\s*:\s*"[^"]*"[^}]*\}/g;
          let match;
          while ((match = objectRegex.exec(repaired)) !== null) {
            try {
              // 尝试修复单个对象
              let objStr = match[0];
              // 确保所有字段都有值
              objStr = objStr.replace(/"([^"]+)":\s*"(?!\s*[},])/g, '"$1": "');
              const obj = JSON.parse(objStr);
              if (obj.question) {
                items.push(obj);
              }
            } catch {
              // 跳过无法解析的对象
            }
          }
          if (items.length > 0) {
            return items;
          }
        }
        
        // 对于带 results 的对象
        if (repaired.includes('"results"')) {
          const items: any[] = [];
          const objectRegex = /\{\s*"question"\s*:\s*"[^"]*"[^}]*"userAnswer"\s*:[^}]*\}/g;
          let match;
          while ((match = objectRegex.exec(repaired)) !== null) {
            try {
              let objStr = match[0];
              objStr = objStr.replace(/"([^"]+)":\s*"(?!\s*[},])/g, '"$1": "');
              const obj = JSON.parse(objStr);
              if (obj.question) {
                // 确保必要字段存在
                obj.userAnswer = obj.userAnswer || '';
                obj.correctAnswer = obj.correctAnswer || '';
                obj.isCorrect = obj.isCorrect || false;
                obj.questionId = obj.questionId || 0;
                items.push(obj);
              }
            } catch {
              // 跳过无法解析的对象
            }
          }
          if (items.length > 0) {
            return {
              results: items,
              score: items.filter(i => i.isCorrect).length,
              total: items.length
            };
          }
        }
      } catch (e3) {
        // 放弃
      }
      throw e;
    }
  }
}
