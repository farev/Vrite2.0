import { createSupabaseClient } from './supabase.ts';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
}

export async function getOpenAIClient(): Promise<OpenAIConfig> {
  const supabase = createSupabaseClient();
  
  // Retrieve API key from Vault
  const { data, error } = await supabase.rpc('get_secret', {
    secret_name: 'openai_api_key',
  });
  
  if (error) {
    console.error('Failed to retrieve OpenAI API key:', error);
    throw new Error('Failed to retrieve OpenAI API key');
  }
  
  if (!data) {
    throw new Error('OpenAI API key not found in vault');
  }
  
  return {
    apiKey: data as string,
    baseUrl: 'https://api.openai.com/v1',
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

export interface Tool {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function createChatCompletion(
  config: OpenAIConfig,
  options: {
    model: string;
    messages: ChatMessage[];
    tools?: Tool[];
    tool_choice?: string;
    max_tokens?: number;
    temperature?: number;
    response_format?: { type: string };
  }
): Promise<ChatCompletionResponse> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', errorText);
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }
  
  return await response.json();
}
