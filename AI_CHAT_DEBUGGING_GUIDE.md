# AI Chat Debugging Guide

This guide will help you debug and verify the AI chat functionality in Vrite.

## Recent Changes

### Enhanced Logging
All Edge Functions now have comprehensive logging that will appear in Supabase logs:
- **Authentication flow**: Detailed token verification and user session checks
- **Rate limiting**: Clear indication of rate limit status
- **OpenAI API calls**: Request/response details, token usage, and error messages
- **Client-side requests**: Full request/response cycle logging

### Strengthened Authentication
- Added validation for all environment variables
- Enhanced error messages for missing configuration
- Better token validation and error reporting

## How to Debug

### 1. Check Supabase Edge Function Logs

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `qkdrjsylfnravzhnlvcy`
3. Navigate to **Edge Functions** → **Logs**
4. Try triggering the AI chat
5. Look for logs starting with:
   - `=== AI Command Function Started ===`
   - `[ai-command]`
   - `[Auth]`
   - `[OpenAI]`

### 2. Check Browser Console

Open your browser's Developer Tools (F12) and check the Console tab for:
- `[AIAssistant]` - Client-side AI request logs
- Error messages with detailed context
- Network requests to `/functions/v1/ai-command`

### 3. Check Network Tab

In Developer Tools → Network:
1. Filter for `ai-command`
2. Check the request:
   - **Headers**: Verify `Authorization: Bearer <token>` is present
   - **Payload**: Verify `content` and `instruction` are being sent
3. Check the response:
   - **Status**: Should be 200 (or 401/500 with error details)
   - **Response body**: Should contain `type`, `changes`, `summary`

## Common Issues and Solutions

### Issue 1: "No authorization header"

**Symptoms**: 
- Logs show: `[Auth] ❌ CRITICAL: No authorization header found`
- Status: 401 Unauthorized

**Solution**:
1. Verify you're logged in (check top-right corner of app)
2. Log out and log back in to refresh your session
3. Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in `.env.local`

### Issue 2: "OpenAI API key not found in vault"

**Symptoms**:
- Logs show: `[OpenAI] ❌ OpenAI API key not found in vault`
- Error message mentions "vault" or "get_secret"

**Solution**:
1. Ensure the OpenAI API key is stored in Supabase Vault:
   ```bash
   cd Vrite2.0
   supabase secrets set OPENAI_API_KEY=sk-your-key-here
   ```
2. Verify the `get_secret` function exists in your database (check migrations)
3. Redeploy functions after setting secrets:
   ```bash
   supabase functions deploy
   ```

### Issue 3: "Rate limit exceeded"

**Symptoms**:
- Error message: "Rate limit exceeded. Please wait before making more requests."
- Status: 429

**Solution**:
- Wait 60 seconds before trying again
- The default limit is 10 requests per minute per user
- Check logs for: `[RateLimit] Rate limit check result: BLOCKED`

### Issue 4: Session/Token Issues

**Symptoms**:
- Error: "Not authenticated"
- Token validation fails
- User session not found

**Solution**:
1. **Clear browser storage**:
   - Open DevTools → Application → Storage
   - Clear all site data
2. **Log out and log back in**:
   - This refreshes your OAuth tokens
   - Ensures you have both access_token and provider_token
3. **Check Supabase Auth settings**:
   - Go to Supabase Dashboard → Authentication → Providers
   - Verify Google OAuth is configured correctly

### Issue 5: Environment Variables Not Set

**Symptoms**:
- Logs show: `environment variable not set`
- Functions fail to start

**Solution**:
1. **Frontend** (`Vrite2.0/vrite/.env.local`):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_APP_URL=http://localhost:3001
   ```

2. **Backend** (Supabase Secrets):
   ```bash
   cd Vrite2.0
   supabase secrets set OPENAI_API_KEY=sk-your-key-here
   ```

3. **Verify Edge Function environment**:
   - SUPABASE_URL (auto-set by Supabase)
   - SUPABASE_ANON_KEY (auto-set by Supabase)
   - SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)

## Verification Checklist

Use this checklist to verify your setup:

### Frontend Setup
- [ ] `.env.local` file exists in `Vrite2.0/vrite/`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` is set correctly
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set correctly
- [ ] App is running: `npm run dev` (in `Vrite2.0/vrite/`)
- [ ] Can access app at http://localhost:3001
- [ ] Can log in successfully

### Backend Setup
- [ ] OpenAI API key is stored in Supabase Vault
- [ ] Edge Functions are deployed: `supabase functions deploy`
- [ ] Can see functions in Supabase Dashboard
- [ ] Database migrations are applied
- [ ] `get_secret` function exists in database

### Testing
- [ ] Open browser console (F12)
- [ ] Navigate to a document
- [ ] Open AI Assistant (Ctrl+K or click sparkle icon)
- [ ] Send a test message: "Make this text bold"
- [ ] Check console for `[AIAssistant]` logs
- [ ] Check Supabase Dashboard for Edge Function logs
- [ ] Verify response appears in chat

## Detailed Log Analysis

### Successful Request Flow

You should see logs in this order:

1. **Client Side** (Browser Console):
   ```
   [AIAssistant] Starting AI command request...
   [AIAssistant] Document content length: 123
   [AIAssistant] Getting Supabase session...
   [AIAssistant] ✅ Session found for user: your@email.com
   [AIAssistant] Sending request...
   [AIAssistant] Response status: 200 OK
   [AIAssistant] ✅ Response received, parsing...
   [AIAssistant] Response type: tool_based
   [AIAssistant] Changes count: 2
   ```

2. **Server Side** (Supabase Logs):
   ```
   === AI Command Function Started ===
   [ai-command] Request method: POST
   === [Auth] Starting Authentication Verification ===
   [Auth] ✅ Authorization header present
   [Auth] ✅ Authentication successful!
   [Auth] User ID: abc123...
   [RateLimit] Rate limit check result: ALLOWED
   [ai-command] Request data received
   === [OpenAI] Getting OpenAI Client ===
   [OpenAI] ✅ API key retrieved successfully
   [ai-command] Making OpenAI API call...
   === [OpenAI] Creating Chat Completion ===
   [OpenAI] ✅ API call successful
   [ai-command] Tool calls received: 2
   [ai-command] ✅ Request completed successfully
   === AI Command Function Completed ===
   ```

### Failed Request - Authentication Error

```
=== AI Command Function Started ===
=== [Auth] Starting Authentication Verification ===
[Auth] ❌ CRITICAL: No authorization header found
[Auth] Available headers: {...}
[ai-command] ❌ Error: No authorization header
```

**Action**: Log out and log back in.

### Failed Request - OpenAI API Key Missing

```
=== [OpenAI] Getting OpenAI Client ===
[OpenAI] Calling RPC function: get_secret
[OpenAI] ❌ OpenAI API key not found in vault
```

**Action**: Set the OpenAI API key in Supabase Vault.

## Testing Commands

Try these commands to test the AI chat:

1. **Simple formatting**: "Make the word 'hello' bold"
2. **Multiple changes**: "Make all headings bold and capitalize them"
3. **Content generation**: "Add a conclusion paragraph"
4. **Style improvement**: "Make this more professional"

## Support

If you're still having issues after following this guide:

1. **Collect logs**:
   - Browser console logs (copy all `[AIAssistant]` entries)
   - Supabase Edge Function logs (copy the full request cycle)
   - Network tab details (request/response)

2. **Check versions**:
   - Node.js version: `node --version`
   - npm version: `npm --version`
   - Supabase CLI version: `supabase --version`

3. **Verify API keys**:
   - OpenAI API key is valid and has credits
   - Supabase project is active
   - OAuth providers are configured

## Quick Fix Commands

```bash
# Navigate to project
cd Vrite2.0

# Set OpenAI API key
supabase secrets set OPENAI_API_KEY=sk-your-actual-key-here

# Deploy functions
supabase functions deploy

# Restart Next.js dev server
cd vrite
npm run dev
```

## Additional Resources

- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
