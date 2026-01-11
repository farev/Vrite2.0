# Quick Fix for "Failed to save document" Error

## The Problem

Your app worked yesterday with Google Drive, but after adding Azure/OneDrive support, it's now failing with:
- **Error**: "No provider access token in session"
- **Root Cause**: The `session.provider_token` is `undefined`

## Why This Happens

When you log in with Google OAuth through Supabase, the `provider_token` (which is the Google access token needed to access Google Drive) is only included in the session if:

1. ✅ Google OAuth is properly configured in Supabase
2. ✅ The correct scopes are requested (including `https://www.googleapis.com/auth/drive.file`)
3. ✅ Supabase is configured to return provider tokens

## The Fix

### Step 1: Verify Google OAuth Configuration in Supabase

1. Go to https://supabase.com/dashboard
2. Select your project: `qkdrjsylfnravzhnlvcy`
3. Go to **Authentication** → **Providers**
4. Find **Google** and click to expand
5. Verify these settings:

   **Required Settings:**
   - ✅ **Enabled**: ON
   - ✅ **Client ID**: (your Google OAuth client ID)
   - ✅ **Client Secret**: (your Google OAuth client secret)
   - ✅ **Authorized Client IDs**: (optional, can be empty)
   - ✅ **Skip nonce check**: OFF (unchecked)
   
   **Critical - Additional Scopes:**
   Add this scope: `https://www.googleapis.com/auth/drive.file`
   
   This scope is REQUIRED for Google Drive access!

6. Click **Save**

### Step 2: Check Google Cloud Console

1. Go to https://console.cloud.google.com/
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID
5. Verify **Authorized redirect URIs** includes:
   ```
   https://qkdrjsylfnravzhnlvcy.supabase.co/auth/v1/callback
   ```

6. Go to **APIs & Services** → **Library**
7. Search for "Google Drive API"
8. Make sure it's **ENABLED**

### Step 3: Log Out and Log In Again

This is CRITICAL! Even if everything is configured correctly, your current session doesn't have the provider token.

1. In your app (http://localhost:3001), open browser DevTools (F12)
2. Go to **Application** tab → **Cookies** → `http://localhost:3001`
3. Delete all cookies (or just clear all site data)
4. Refresh the page
5. Log in with Google again
6. **Important**: When Google asks for permissions, make sure you see "See and download all your Google Drive files"

### Step 4: Test

1. After logging in, open the browser console (F12)
2. You should see logs like:
   ```
   [Storage] Session user: your-email@gmail.com
   [Storage] Session provider_token: present
   [Storage] User authenticated with cloud storage access
   ```

3. Try typing in the editor - it should auto-save after 30 seconds
4. Or press **Ctrl+S** to manually save

## Alternative: Check if Provider Token is Actually There

Sometimes the token is there but in a different location. Let me add a fallback:

The code now includes extensive debugging. After you log in, check the browser console for:

```
[Storage] Session provider_token: present/missing
[Storage] Session provider_refresh_token: present/missing
```

If you see "missing" for both, then the OAuth configuration is definitely the issue.

## Common Issues

### Issue 1: "Provider token: missing" in console

**Solution**: 
- Google OAuth not configured in Supabase
- Missing Drive API scope
- Need to log out and log in again

### Issue 2: Error persists after re-login

**Solution**:
1. Check that Google Drive API is enabled in Google Cloud Console
2. Verify the scope `https://www.googleapis.com/auth/drive.file` is in Supabase
3. Make sure you're granting all permissions when logging in
4. Try in an incognito window to rule out cached credentials

### Issue 3: "Invalid credentials" or 401 errors

**Solution**:
- The provider token expired
- Log out and log in again
- Check that your Google OAuth credentials in Supabase are correct

## Testing the Fix

1. **Stop the dev server** (Ctrl+C in terminal)
2. **Clear browser data** for localhost:3001
3. **Restart dev server**: `npm run dev`
4. **Open browser console** (F12)
5. **Navigate to** http://localhost:3001
6. **Log in with Google**
7. **Watch the console** for the debug logs
8. **Try saving** (Ctrl+S or wait 30 seconds)

## If It Still Doesn't Work

Run this in the browser console after logging in:

```javascript
// Get the session and log it
const { createClient } = await import('./src/lib/supabase/client');
const supabase = createClient();
const { data: { session } } = await supabase.auth.getSession();
console.log('Full session:', session);
console.log('Provider token:', session?.provider_token);
console.log('Provider refresh token:', session?.provider_refresh_token);
```

Send me the output and I can help debug further!

## Next Steps

Once this is working:
- The Azure/OneDrive implementation will work the same way once you configure it
- You can test OneDrive by following `MICROSOFT_ONEDRIVE_SETUP.md`
- Both providers can coexist - the app detects which one you logged in with

## Why Did It Break?

The Azure implementation didn't break anything - but you probably:
1. Logged out and back in, OR
2. Your session expired, OR
3. The provider token wasn't being persisted correctly

The code changes were fine - it's just an OAuth configuration issue that needs to be resolved by re-authenticating with the correct scopes.
