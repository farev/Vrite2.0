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
      .select('id, email, full_name, welcome_email_sent_at')
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
    const appUrl = Deno.env.get('APP_URL') || 'https://www.vibewrite.work';
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

    const firstName = user.full_name?.split(' ')[0] || 'there';

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
        html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,serif;color:#1a1a1a">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:48px 32px">
    <tr><td>
      <p style="font-size:16px;line-height:1.7;margin:0 0 16px">Hey ${firstName},</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 16px">Welcome to VibeWrite!</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 16px">Wasting time on manual work is a thing of the past. We have seen this with coding and now we have built it for writing. VibeWrite assists you with writing, formatting, and finishing all of your documents. Need a specific format? Need beautiful tables? Need properly crafted formulas? Just ask VibeWrite to do it!</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 16px">We want to make sure we’re solving the right problems and could use your help. If you have 15 minutes, we’d love to hop on a quick call to hear your thoughts: <a href="https://calendly.com/fabiareor/30min" style="color:#2563eb">book a time here</a>.</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 32px">If you’re short on time, just reply to this email and tell us: what’s the one thing you wish your current writing tool could do?</p>
      <p style="font-size:16px;line-height:1.7;margin:0 0 48px">Best,<br>Fabian and Carlos<br><span style="color:#6b7280">Founders at VibeWrite</span></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 32px">
      <div style="text-align:center">
        <img src="${appUrl}/vibewrite-logo.png" alt="VibeWrite" width="180" style="display:block;margin:0 auto;max-width:180px">
      </div>
    </td></tr>
  </table>
</body>
</html>`,
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
