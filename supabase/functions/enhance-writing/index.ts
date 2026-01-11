import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, checkRateLimit } from '../_shared/auth.ts';
import { getOpenAIClient, createChatCompletion } from '../_shared/openai.ts';

interface EnhanceRequest {
  prompt: string;
  context?: string;
}

interface EnhanceResponse {
  enhanced_content: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const { user, supabase } = await verifyAuth(req);
    
    const isAllowed = await checkRateLimit(user.id, 'enhance-writing', supabase, 10, 60);
    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    const { prompt, context }: EnhanceRequest = await req.json();
    
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: prompt' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    const openaiConfig = await getOpenAIClient();
    
    const contextText = context ? `Context: ${context}\n\n` : '';
    const fullPrompt = `${contextText}Generate or enhance the following writing request:\n${prompt}\n\nProvide clear, well-structured content that flows naturally with any existing context.`;
    
    const response = await createChatCompletion(openaiConfig, {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });
    
    const enhanced_content = response.choices[0].message.content || '';
    
    const responseData: EnhanceResponse = {
      enhanced_content,
    };
    
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Enhance writing error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
