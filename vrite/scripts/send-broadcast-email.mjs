/**
 * One-off broadcast email script.
 *
 * Usage:
 *   node scripts/send-broadcast-email.mjs --dry-run
 *   node scripts/send-broadcast-email.mjs --to=you@example.com
 *   node scripts/send-broadcast-email.mjs --limit=50
 *   node scripts/send-broadcast-email.mjs --send-all --confirm-send-all
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   RESEND_FROM
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
loadEnvFile(path.join(projectRoot, '.env.local'));
loadEnvFile(path.join(projectRoot, '.env'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || '';

const SUBJECT = 'Meet the team and learn about VibeWrite';
const HTML = `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;line-height:1.6;color:#111827;">
  <h2 style="margin-bottom:12px;">Hey from VibeWrite 👋</h2>
  <p>Quick invite for tonight: we are hosting an event and you can drop by anytime.</p>
  <p><strong>Time:</strong> 6:30 PM - 8:00 PM</p>
  <p><strong>Link:</strong> <a href="https://luma.com/mq9kkkdm">https://luma.com/mq9kkkdm</a></p>
  <p>Would love to see you there.</p>
  <p style="margin-top:24px;">- Fabian and Carlos</p>
</div>
`;

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const sendAll = args.includes('--send-all');
const confirmSendAll = args.includes('--confirm-send-all');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const toArg = args.find((arg) => arg.startsWith('--to='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const singleRecipient = toArg ? toArg.split('=').slice(1).join('=').trim() : '';

if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
  console.error('Invalid --limit value. Example: --limit=50');
  process.exit(1);
}

if (singleRecipient && !singleRecipient.includes('@')) {
  console.error('Invalid --to email. Example: --to=you@example.com');
  process.exit(1);
}

if (singleRecipient && sendAll) {
  console.error('Use either --to=<email> or --send-all, not both.');
  process.exit(1);
}

if (!singleRecipient && !sendAll && !isDryRun) {
  console.error('Safety check: broadcast sending is disabled unless you pass --send-all --confirm-send-all.');
  console.error('For testing, use: --to=you@example.com');
  console.error('For preview, use: --dry-run');
  process.exit(1);
}

if (sendAll && !confirmSendAll && !isDryRun) {
  console.error('Missing --confirm-send-all. Refusing to broadcast.');
  process.exit(1);
}

const missing = [];
if (!RESEND_API_KEY) missing.push('RESEND_API_KEY');
if (!RESEND_FROM) missing.push('RESEND_FROM');
if (!singleRecipient && (sendAll || isDryRun)) {
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
}

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = singleRecipient
  ? null
  : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

async function fetchAllRecipientEmails() {
  if (!supabase) return [];
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name')
      .not('email', 'is', null)
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows = allRows.concat(data);
    if (data.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return allRows;
}

async function sendEmail(toEmail, firstName) {
  const personalizedHtml = HTML.replace('Hey from VibeWrite 👋', `Hey ${firstName || 'there'} 👋`);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: toEmail,
        subject: SUBJECT,
        html: personalizedHtml,
      }),
    });

    if (response.ok) {
      return;
    }

    if (response.status === 429 && attempt < 4) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 1200;
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfterMs) ? retryAfterMs : 1200));
      continue;
    }

    const text = await response.text();
    throw new Error(`Resend error ${response.status}: ${text}`);
  }
}

async function run() {
  if (singleRecipient) {
    console.log(`Starting single-recipient test${isDryRun ? ' (dry-run)' : ''}...`);
    if (isDryRun) {
      console.log(`[dry-run] ${singleRecipient}`);
      return;
    }
    await sendEmail(singleRecipient, 'Carlos');
    console.log(`Sent test email to: ${singleRecipient}`);
    return;
  }

  console.log(`Starting broadcast${isDryRun ? ' (dry-run)' : ''}...`);
  const rows = await fetchAllRecipientEmails();
  const recipients = limit ? rows.slice(0, limit) : rows;

  console.log(`Found ${rows.length} users with emails.`);
  console.log(`Will process ${recipients.length} recipients.`);

  if (isDryRun) {
    for (const row of recipients.slice(0, 10)) {
      console.log(`[dry-run] ${row.email}`);
    }
    if (recipients.length > 10) {
      console.log(`[dry-run] ...and ${recipients.length - 10} more`);
    }
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const row of recipients) {
    const firstName = row.full_name ? String(row.full_name).trim().split(' ')[0] : 'there';
    try {
      await sendEmail(row.email, firstName);
      sent += 1;
      console.log(`Sent (${sent}/${recipients.length}): ${row.email}`);
      // Keep throughput below Resend's 5 req/s default limit.
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (error) {
      failed += 1;
      console.error(`Failed: ${row.email} - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Done. Sent: ${sent}, Failed: ${failed}, Total: ${recipients.length}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
