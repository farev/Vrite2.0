import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, checkRateLimit } from '../_shared/auth.ts';
import { getOpenAIClient, createChatCompletion } from '../_shared/openai.ts';

interface AutocompleteRequest {
  context: string;
  max_tokens?: number;
}

interface AutocompleteResponse {
  completion: string;
}

Deno.serve(async (req) => {
  console.log('[Autocomplete] Function called with method:', req.method);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('[Autocomplete] Handling CORS preflight');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[Autocomplete] Starting autocomplete request processing');

    // Verify authentication
    console.log('[Autocomplete] Verifying authentication...');
    const { user, supabase } = await verifyAuth(req);
    console.log('[Autocomplete] Authentication successful for user:', user.id);

    // Check rate limit (20 requests per minute for autocomplete)
    console.log('[Autocomplete] Checking rate limit...');
    const isAllowed = await checkRateLimit(user.id, 'autocomplete', supabase, 20, 60);
    console.log('[Autocomplete] Rate limit check result:', isAllowed);

    if (!isAllowed) {
      console.log('[Autocomplete] Rate limit exceeded for user:', user.id);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait before making more autocomplete requests.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    console.log('[Autocomplete] Parsing request body...');
    const requestData: AutocompleteRequest = await req.json();
    const { context, max_tokens = 50 } = requestData;
    console.log('[Autocomplete] Parsed request - context length:', context?.length, 'max_tokens:', max_tokens);

    if (!context || context.trim().length === 0) {
      console.log('[Autocomplete] Invalid context provided');
      return new Response(
        JSON.stringify({ error: 'Missing required field: context' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get OpenAI client
    console.log('[Autocomplete] Getting OpenAI client...');
    const openaiConfig = await getOpenAIClient();
    console.log('[Autocomplete] OpenAI client obtained successfully');

    // Build messages for completion
    const messages = [
      {
        role: 'system' as const,
        content: 'You are an AI writing assistant. Provide concise, natural text completions. Complete the user\'s sentence or thought in 1-2 sentences. Do not add explanations or meta-commentary.',
      },
      {
        role: 'user' as const,
        content: `Complete this text naturally: "${context}"`,
      },
    ];
    console.log('[Autocomplete] Built messages for OpenAI API call');

    // Make OpenAI API call
    console.log('[Autocomplete] Making OpenAI API call...');
    const response = await createChatCompletion(openaiConfig, {
      model: 'gpt-4o',
      messages,
      max_tokens: Math.min(max_tokens, 100), // Cap at 100 tokens
      temperature: 0.7,
      stop: ['\n\n', '---'], // Stop at paragraph breaks or section markers
    });
    console.log('[Autocomplete] OpenAI API call completed');

    const completion = response.choices[0].message.content?.trim() || '';
    console.log('[Autocomplete] Completion generated, length:', completion.length);

    // Return response
    const responseData: AutocompleteResponse = {
      completion,
    };
    console.log('[Autocomplete] Returning response with completion');

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Autocomplete] Error occurred:', error);
    console.error('[Autocomplete] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});