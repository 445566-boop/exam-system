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
