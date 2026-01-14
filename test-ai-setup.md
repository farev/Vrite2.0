# AI Chat Setup Verification

## ✅ Deployment Complete

The Edge Functions have been successfully deployed with enhanced logging!

## Next Steps

### 1. Verify OpenAI API Key

Make sure your OpenAI API key is set in Supabase Vault:

```bash
cd Vrite2.0
supabase secrets set OPENAI_API_KEY=sk-your-actual-openai-key-here
```

To verify it's set:
```bash
supabase secrets list
```

### 2. Test the AI Chat

1. **Start the development server** (if not already running):
   ```bash
   cd vrite
   npm run dev
   ```

2. **Open the app**: http://localhost:3001

3. **Log in** with your Google account

4. **Open a document** (create new or open existing)

5. **Open AI Assistant**:
   - Click the sparkle ✨ icon in the toolbar, OR
   - Press `Ctrl+K` (or `Cmd+K` on Mac)

6. **Send a test message**:
   - Type: "Make the word 'hello' bold"
   - Click Send

### 3. Monitor the Logs

#### Browser Console (F12)
Look for logs starting with `[AIAssistant]`:
```
[AIAssistant] Starting AI command request...
[AIAssistant] ✅ Session found for user: your@email.com
[AIAssistant] Response status: 200 OK
```

#### Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/qkdrjsylfnravzhnlvcy/functions
2. Click on **ai-command** function
3. Click on **Logs** tab
4. Look for logs starting with:
   ```
   === AI Command Function Started ===
   [ai-command] Request method: POST
   [Auth] ✅ Authentication successful!
   [OpenAI] ✅ API key retrieved successfully
   ```

## Common Issues

### Issue: "No authorization header"

**Fix**: Log out and log back in to refresh your session.

### Issue: "OpenAI API key not found in vault"

**Fix**: 
```bash
cd Vrite2.0
supabase secrets set OPENAI_API_KEY=sk-your-key-here
```

### Issue: "Failed to retrieve OpenAI API key"

**Fix**: Ensure the database migration for `get_secret` function is applied:
```bash
cd Vrite2.0
supabase db push
```

### Issue: No response or timeout

**Possible causes**:
1. OpenAI API key is invalid or has no credits
2. Network connectivity issues
3. Rate limiting (wait 60 seconds)

**Check**:
- Supabase Edge Function logs for detailed error messages
- Browser Network tab for failed requests
- OpenAI dashboard for API usage/errors

## What Changed

### Enhanced Logging
All functions now log:
- ✅ Authentication flow details
- ✅ Request/response data
- ✅ OpenAI API calls and responses
- ✅ Error details with context
- ✅ Rate limiting status

### Better Error Handling
- Clear error messages for common issues
- Validation of all environment variables
- Detailed error context in logs
- User-friendly error messages in UI

### Strengthened Authentication
- Token validation with detailed logging
- Session verification
- Better error messages for auth failures

## Testing Checklist

- [ ] OpenAI API key is set in Supabase Vault
- [ ] Functions are deployed (just completed ✅)
- [ ] App is running on http://localhost:3001
- [ ] Can log in successfully
- [ ] Can open AI Assistant (Ctrl+K)
- [ ] Can send a message
- [ ] See logs in browser console
- [ ] See logs in Supabase Dashboard
- [ ] Receive AI response

## Need Help?

See the full debugging guide: `AI_CHAT_DEBUGGING_GUIDE.md`

## Quick Commands Reference

```bash
# Deploy functions
cd Vrite2.0
supabase functions deploy

# Set OpenAI key
supabase secrets set OPENAI_API_KEY=sk-your-key

# List secrets
supabase secrets list

# View function logs (in dashboard)
# https://supabase.com/dashboard/project/qkdrjsylfnravzhnlvcy/functions

# Start dev server
cd vrite
npm run dev
```
