import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limit store (for demonstration)
// In production, use Redis or a database
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Cleanup old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 3600000); // 1 hour

function getRateLimitKey(sessionId: string | null, ip: string | null): string {
  return `${sessionId || 'no-session'}-${ip || 'no-ip'}`;
}

function checkAndIncrementRateLimit(key: string): { allowed: boolean; count: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    // New entry or expired - reset
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + 24 * 60 * 60 * 1000, // 24 hours
    });
    return { allowed: true, count: 1 };
  }

  // Existing entry - check limit
  if (entry.count >= 3) {
    return { allowed: false, count: entry.count };
  }

  // Increment count
  entry.count += 1;
  rateLimitStore.set(key, entry);

  return { allowed: true, count: entry.count };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { document, instruction, conversation_history, isOnboarding } = body;

    // Get session ID and IP for rate limiting
    const sessionId = request.headers.get('x-session-id');
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    console.log('[AI Anonymous] Request from session:', sessionId, 'IP:', ip, 'isOnboarding:', isOnboarding);

    // Skip rate limiting for onboarding requests
    if (!isOnboarding) {
      const rateLimitKey = getRateLimitKey(sessionId, ip);
      const rateLimit = checkAndIncrementRateLimit(rateLimitKey);

      if (!rateLimit.allowed) {
        console.log('[AI Anonymous] Rate limit exceeded for:', rateLimitKey);
        return NextResponse.json(
          {
            error: 'Rate limit exceeded. Sign in for unlimited AI access.',
            limit: 3,
            current: rateLimit.count,
          },
          { status: 429 }
        );
      }

      console.log('[AI Anonymous] Rate limit OK:', rateLimit.count, '/ 3');
    } else {
      console.log('[AI Anonymous] Onboarding request - bypassing rate limit');
    }

    // Proxy to Supabase Edge Function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[AI Anonymous] Missing Supabase configuration');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Call the Supabase Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/ai-agent`;

    console.log('[AI Anonymous] Calling Edge Function:', edgeFunctionUrl);

    const edgeFunctionResponse = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        document,
        instruction,
        conversation_history,
      }),
    });

    if (!edgeFunctionResponse.ok) {
      const errorText = await edgeFunctionResponse.text();
      console.error('[AI Anonymous] Edge Function error:', errorText);
      return NextResponse.json(
        { error: 'AI service error', details: errorText },
        { status: edgeFunctionResponse.status }
      );
    }

    const result = await edgeFunctionResponse.json();
    console.log('[AI Anonymous] Edge Function success');

    return NextResponse.json(result);
  } catch (error) {
    console.error('[AI Anonymous] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
