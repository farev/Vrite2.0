import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';

interface SendLoginEmailPayload {
  userId: string;
  email?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const payload = (await req.json()) as SendLoginEmailPayload;
    if (!payload?.userId) {
      return new Response(
        JSON.stringify({ error: 'Missing userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseClient();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, welcome_email_sent_at')
      .eq('id', payload.userId)
      .single();

    if (userError || !user) {
      console.error('[send-login-email] Failed to load user record', userError);
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (user.welcome_email_sent_at) {
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFrom = Deno.env.get('RESEND_FROM');
    if (!resendApiKey || !resendFrom) {
      console.error('[send-login-email] Missing Resend configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recipient = payload.email || user.email;
    if (!recipient) {
      return new Response(
        JSON.stringify({ error: 'Missing recipient email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: resendFrom,
        to: recipient,
        subject: 'Welcome to VibeWrite',
        text: `Welcome to VibeWrite
Hey there,

Welcome to VibeWrite.

We built this because we were tired of "dumb" word processors. VibeWrite is AI-native from the ground up—think Cursor, but for documents. Instead of staring at a blank page, just hit Cmd + K and let the editor work with you. Whether you're drafting a memo or refactoring an entire essay, the goal is to keep you in flow.

We need your help: We’re building this in the open and want to make sure we’re solving the right problems. If you have 15 minutes, we’d love to hop on a quick call to hear your thoughts https://calendly.com/d/ctmj-ssb-tdc/vibewrite.

If you're short on time, just reply to this email and tell us: what’s the one thing you wish your current writing tool could do?

Cheers,

Fabian and Carlos
Founders, VibeWrite`,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('[send-login-email] Resend error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Email send failed' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', payload.userId);

    if (updateError) {
      console.error('[send-login-email] Failed to update user record', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update user record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, sent: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-login-email] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
