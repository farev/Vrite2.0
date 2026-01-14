import { createSupabaseClient } from './supabase.ts';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
}

export async function getOpenAIClient(): Promise<OpenAIConfig> {
  console.log('=== [OpenAI] Getting OpenAI Client ===');
  
  try {
    const supabase = createSupabaseClient();
    console.log('[OpenAI] Supabase client created');

    // Retrieve API key from Vault
    console.log('[OpenAI] Retrieving API key from Supabase Vault...');
    console.log('[OpenAI] Calling RPC function: get_secret');
    console.log('[OpenAI] Secret name: OPENAI_API_KEY');
    
    const { data, error } = await supabase.rpc('get_secret', {
      secret_name: 'OPENAI_API_KEY',
    });

    console.log('[OpenAI] RPC call completed');
    console.log('[OpenAI] Error present:', !!error);
    console.log('[OpenAI] Data present:', !!data);

    if (error) {
      console.error('[OpenAI] ❌ Failed to retrieve OpenAI API key from vault');
      console.error('[OpenAI] Error message:', error.message);
      console.error('[OpenAI] Error details:', JSON.stringify(error, null, 2));
      console.error('[OpenAI] This usually means:');
      console.error('[OpenAI]   1. The get_secret function does not exist in the database');
      console.error('[OpenAI]   2. The OPENAI_API_KEY secret is not stored in Supabase Vault');
      console.error('[OpenAI]   3. Permissions are not set correctly for the service role');
      throw new Error(`Failed to retrieve OpenAI API key: ${error.message}`);
    }

    if (!data) {
      console.error('[OpenAI] ❌ OpenAI API key not found in vault (data is null/empty)');
      console.error('[OpenAI] Please ensure OPENAI_API_KEY is stored in Supabase Vault');
      console.error('[OpenAI] Run: supabase secrets set OPENAI_API_KEY=your-key-here');
      throw new Error('OpenAI API key not found in vault - please configure it in Supabase');
    }

    const apiKey = data as string;
    console.log('[OpenAI] ✅ API key retrieved successfully');
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
  console.log('=== [OpenAI] Creating Chat Completion ===');
  console.log('[OpenAI] Model:', options.model);
  console.log('[OpenAI] Messages count:', options.messages.length);
  console.log('[OpenAI] Tools provided:', options.tools?.length || 0);
  console.log('[OpenAI] Tool choice:', options.tool_choice || 'none');
  console.log('[OpenAI] Max tokens:', options.max_tokens);
  console.log('[OpenAI] Temperature:', options.temperature);
  console.log('[OpenAI] Response format:', options.response_format?.type || 'text');

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
        'Authorization': `Bearer ${config.apiKey}`,
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
