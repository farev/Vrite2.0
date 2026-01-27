export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
}

export async function getOpenAIClient(): Promise<OpenAIConfig> {
  console.log('=== [OpenAI] Getting OpenAI Client ===');
  
  try {
    // Retrieve API key from Edge Function secret (env var)
    console.log('[OpenAI] Retrieving API key from Edge Function secret...');
    const rawApiKey = Deno.env.get('OPENAI_API_KEY');
    console.log('[OpenAI] API key present:', !!rawApiKey);

    const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : '';
    if (!apiKey) {
      console.error('[OpenAI] ❌ OpenAI API key missing or empty');
      console.error('[OpenAI] Set it with: supabase secrets set OPENAI_API_KEY=your-key-here');
      throw new Error('OpenAI API key not configured - please set OPENAI_API_KEY as an Edge Function secret');
    }

    console.log('[OpenAI] API key length:', apiKey.length);
    console.log('[OpenAI] API key prefix:', apiKey.substring(0, 7) + '...');
    console.log('=== [OpenAI] OpenAI Client Ready ===');
    
    return {
      apiKey,
      baseUrl: 'https://api.openai.com/v1',
    };
  } catch (error) {
    console.error('=== [OpenAI] Failed to Get OpenAI Client ===');
    console.error('[OpenAI] ❌ Exception:', error);
    throw error;
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
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
    max_tokens?: number; // Deprecated for newer models, use max_completion_tokens
    max_completion_tokens?: number; // For GPT-5-mini and newer models
    temperature?: number; // Not supported on GPT-5 reasoning models
    reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high'; // For GPT-5 reasoning models
    response_format?: { type: string };
  }
): Promise<ChatCompletionResponse> {
  console.log('=== [OpenAI] Creating Chat Completion ===');
  console.log('[OpenAI] Model:', options.model);
  console.log('[OpenAI] Messages count:', options.messages.length);
  console.log('[OpenAI] Tools provided:', options.tools?.length || 0);
  console.log('[OpenAI] Tool choice:', options.tool_choice || 'none');
  console.log('[OpenAI] Max tokens:', options.max_tokens);
  console.log('[OpenAI] Max completion tokens:', options.max_completion_tokens);
  console.log('[OpenAI] Temperature:', options.temperature);
  console.log('[OpenAI] Reasoning effort:', options.reasoning_effort);
  console.log('[OpenAI] Response format:', options.response_format?.type || 'text');

  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  if (!apiKey) {
    throw new Error('OpenAI API key is missing or invalid');
  }

  const url = `${config.baseUrl}/chat/completions`;
  console.log('[OpenAI] API URL:', url);
  
  const requestBody = JSON.stringify(options);
  console.log('[OpenAI] Request body size:', requestBody.length, 'bytes');

  try {
    console.log('[OpenAI] Sending request to OpenAI...');
    const startTime = Date.now();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });

    const elapsed = Date.now() - startTime;
    console.log('[OpenAI] Response received in', elapsed, 'ms');
    console.log('[OpenAI] Response status:', response.status, response.statusText);

    if (!response.ok) {
      console.error('[OpenAI] ❌ API request failed');
      console.error('[OpenAI] Status:', response.status);
      console.error('[OpenAI] Status text:', response.statusText);
      
      const errorText = await response.text();
      console.error('[OpenAI] Error response body:', errorText);
      
      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = JSON.stringify(errorJson, null, 2);
        console.error('[OpenAI] Parsed error:', errorDetails);
      } catch {
        // Error text is not JSON, use as-is
      }
      
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    console.log('[OpenAI] ✅ API call successful, parsing response...');
    const result = await response.json();
    
    console.log('[OpenAI] Response parsed successfully');
    console.log('[OpenAI] Choices count:', result.choices?.length || 0);
    console.log('[OpenAI] Finish reason:', result.choices?.[0]?.finish_reason);
    console.log('[OpenAI] Usage - Prompt tokens:', result.usage?.prompt_tokens);
    console.log('[OpenAI] Usage - Completion tokens:', result.usage?.completion_tokens);
    console.log('[OpenAI] Usage - Total tokens:', result.usage?.total_tokens);
    
    if (result.choices?.[0]?.message?.tool_calls) {
      console.log('[OpenAI] Tool calls in response:', result.choices[0].message.tool_calls.length);
    }
    
    console.log('=== [OpenAI] Chat Completion Complete ===');
    return result;
  } catch (error) {
    console.error('=== [OpenAI] Chat Completion FAILED ===');
    console.error('[OpenAI] ❌ Exception during API call:', error);
    console.error('[OpenAI] Error type:', error?.constructor?.name);
    console.error('[OpenAI] Error message:', error instanceof Error ? error.message : 'Unknown');
    throw error;
  }
}
