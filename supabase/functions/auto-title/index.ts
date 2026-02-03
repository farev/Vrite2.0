import { corsHeaders } from '../_shared/cors.ts';
import { getOpenAIClient, createChatCompletion } from '../_shared/openai.ts';

interface AutoTitleRequest {
  content: string;
}

interface AutoTitleResponse {
  title: string;
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getRateLimitKey(sessionId: string | null, ip: string | null): string {
  return `${sessionId || 'no-session'}-${ip || 'no-ip'}`;
}

function checkAndIncrementRateLimit(key: string): { allowed: boolean; count: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + 24 * 60 * 60 * 1000, // 24 hours
    });
    return { allowed: true, count: 1 };
  }

  if (entry.count >= 10) {
    return { allowed: false, count: entry.count };
  }

  entry.count += 1;
  rateLimitStore.set(key, entry);
  return { allowed: true, count: entry.count };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 3600000);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { content }: AutoTitleRequest = await req.json();

    if (!content?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Missing content' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const sessionId = req.headers.get('x-session-id');
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rateLimitKey = getRateLimitKey(sessionId, ip);
    const rateLimit = checkAndIncrementRateLimit(rateLimitKey);

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const openaiConfig = await getOpenAIClient();
    const prompt =
      'Generate a concise, specific document title (3-7 words). ' +
      'Return only the title text without quotes or punctuation.';

    const response = await createChatCompletion(openaiConfig, {
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: 'You generate short, clear document titles.' },
        { role: 'user', content: `${prompt}\n\nDocument content:\n${content}` },
      ],
      max_completion_tokens: 60,
      reasoning_effort: 'minimal',
    });

    const rawTitle = response.choices[0].message.content || '';
    const title = rawTitle.trim();

    const responseData: AutoTitleResponse = { title };
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[auto-title] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
