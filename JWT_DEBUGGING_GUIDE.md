# JWT Authentication Debugging Guide

## Problem: "Invalid JWT" Error (401)

You're getting a `{"code":401,"message":"Invalid JWT"}` error when calling the `ai-command` Edge Function.

## Root Causes

The "Invalid JWT" error from Supabase Edge Functions typically means:

1. **Token is expired** - The access token has passed its expiration time
2. **Wrong token type** - Using the wrong token (anon key instead of access token)
3. **Token format issue** - Token is malformed or corrupted
4. **JWT secret mismatch** - Edge function can't verify the token signature

## Diagnostic Steps

### Step 1: Check Your Current Session

Open your browser console (F12) and run:

```javascript
// Get current session
const supabase = window.supabase || (await import('/src/lib/supabase/client.js')).createClient();
const { data: { session } } = await supabase.auth.getSession();

console.log('=== SESSION DEBUG ===');
console.log('Session exists:', !!session);
console.log('User email:', session?.user?.email);
console.log('Access token (first 50 chars):', session?.access_token?.substring(0, 50));
console.log('Token expires at:', new Date(session?.expires_at * 1000).toLocaleString());
console.log('Token expired:', session?.expires_at ? Date.now() / 1000 > session.expires_at : 'N/A');
console.log('Time until expiry (minutes):', session?.expires_at ? Math.floor((session.expires_at - Date.now() / 1000) / 60) : 'N/A');
```

### Step 2: Test JWT Validation Manually

Create a test page to validate your JWT:

```javascript
// Test the token directly
const testToken = async () => {
  const supabase = window.supabase || (await import('/src/lib/supabase/client.js')).createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    console.error('No session found!');
    return;
  }

  // Test 1: Verify token with Supabase
  console.log('=== TEST 1: Verify Token ===');
  const { data: { user }, error } = await supabase.auth.getUser(session.access_token);
  console.log('User:', user?.email);
  console.log('Error:', error);

  // Test 2: Call Edge Function
  console.log('=== TEST 2: Call Edge Function ===');
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-command`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: 'Test content',
      instruction: 'Make this bold',
    }),
  });

  console.log('Status:', response.status);
  const text = await response.text();
  console.log('Response:', text);
};

testToken();
```

### Step 3: Check Supabase Edge Function Logs

1. Go to: https://supabase.com/dashboard/project/qkdrjsylfnravzhnlvcy/functions
2. Click on **ai-command** function
3. Click on **Logs** tab
4. Look for authentication errors

You should see logs like:
```
[Auth] ❌ getUser() error details:
  - Error message: Invalid JWT
  - Error status: 401
```

## Solutions

### Solution 1: Refresh Your Session (Most Common Fix)

The token might be expired. Try this:

1. **Log out and log back in**:
   - Click your profile in the top-right
   - Click "Log out"
   - Log back in with Google

2. **Or programmatically refresh**:
   ```javascript
   const supabase = window.supabase || (await import('/src/lib/supabase/client.js')).createClient();
   const { data: { session }, error } = await supabase.auth.refreshSession();
   console.log('Refreshed session:', session?.user?.email);
   console.log('Error:', error);
   ```

### Solution 2: Clear Browser Storage

Sometimes cached tokens cause issues:

1. Open DevTools (F12)
2. Go to **Application** tab
3. Under **Storage**, click **Clear site data**
4. Refresh the page and log in again

### Solution 3: Verify Environment Variables

Make sure your `.env.local` file in `Vrite2.0/vrite/` has the correct values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://qkdrjsylfnravzhnlvcy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important**: The anon key should start with `eyJ...` and be very long.

To get your anon key:
1. Go to: https://supabase.com/dashboard/project/qkdrjsylfnravzhnlvcy/settings/api
2. Copy the **anon/public** key (NOT the service_role key)

### Solution 4: Check Edge Function Environment

The Edge Function needs these environment variables (auto-set by Supabase):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

To verify they're set:
1. Go to: https://supabase.com/dashboard/project/qkdrjsylfnravzhnlvcy/functions
2. Click **ai-command**
3. Check the **Settings** tab

### Solution 5: Redeploy Edge Functions

Sometimes Edge Functions need to be redeployed:

```bash
cd Vrite2.0
supabase functions deploy ai-command
```

### Solution 6: Check JWT Secret (Advanced)

If none of the above work, there might be a JWT secret mismatch:

1. Go to: https://supabase.com/dashboard/project/qkdrjsylfnravzhnlvcy/settings/api
2. Note the **JWT Secret**
3. The Edge Function should automatically use this secret
4. If you've manually set `SUPABASE_JWT_SECRET`, remove it

## Quick Fix Checklist

Try these in order:

- [ ] **Log out and log back in** (fixes 90% of cases)
- [ ] **Clear browser storage** and log in again
- [ ] **Check token expiry** using Step 1 above
- [ ] **Verify `.env.local`** has correct `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] **Check Supabase logs** for detailed error messages
- [ ] **Redeploy Edge Function**: `supabase functions deploy ai-command`
- [ ] **Restart dev server**: Stop and run `npm run dev` again

## Understanding the Flow

Here's how authentication works:

1. **User logs in** → Supabase creates a session with an `access_token` (JWT)
2. **Client makes request** → Sends `Authorization: Bearer <access_token>`
3. **Edge Function receives request** → Extracts token from header
4. **Edge Function validates token** → Calls `supabase.auth.getUser(token)`
5. **Supabase validates JWT** → Checks signature, expiry, format
6. **If valid** → Returns user info, request proceeds
7. **If invalid** → Returns "Invalid JWT" error

The error happens at step 5, meaning Supabase can't validate the JWT.

## Common Mistakes

### ❌ Using the anon key as the token
```javascript
// WRONG - Don't do this
headers: {
  'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
}
```

### ✅ Using the session access token
```javascript
// CORRECT
const { data: { session } } = await supabase.auth.getSession();
headers: {
  'Authorization': `Bearer ${session.access_token}`
}
```

### ❌ Not checking if session exists
```javascript
// WRONG - session might be null
const { data: { session } } = await supabase.auth.getSession();
headers: {
  'Authorization': `Bearer ${session.access_token}` // Error if session is null!
}
```

### ✅ Checking session first
```javascript
// CORRECT
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  throw new Error('Not authenticated');
}
headers: {
  'Authorization': `Bearer ${session.access_token}`
}
```

## Testing Script

Save this as `test-jwt.html` and open it in your browser while logged in:

```html
<!DOCTYPE html>
<html>
<head>
  <title>JWT Test</title>
</head>
<body>
  <h1>JWT Authentication Test</h1>
  <button onclick="testAuth()">Test Authentication</button>
  <pre id="output"></pre>

  <script type="module">
    window.testAuth = async function() {
      const output = document.getElementById('output');
      output.textContent = 'Testing...\n';

      try {
        // Import Supabase client
        const { createClient } = await import('http://localhost:3001/src/lib/supabase/client.js');
        const supabase = createClient();

        // Get session
        output.textContent += '1. Getting session...\n';
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          output.textContent += '❌ No session found! Please log in.\n';
          return;
        }

        output.textContent += `✅ Session found for: ${session.user.email}\n`;
        output.textContent += `   Token expires: ${new Date(session.expires_at * 1000).toLocaleString()}\n`;
        
        const expiresIn = session.expires_at - Date.now() / 1000;
        output.textContent += `   Expires in: ${Math.floor(expiresIn / 60)} minutes\n`;
        
        if (expiresIn < 0) {
          output.textContent += '⚠️  Token is EXPIRED!\n';
        }

        // Test token validation
        output.textContent += '\n2. Validating token with Supabase...\n';
        const { data: { user }, error: userError } = await supabase.auth.getUser(session.access_token);
        
        if (userError) {
          output.textContent += `❌ Token validation failed: ${userError.message}\n`;
        } else {
          output.textContent += `✅ Token is valid for: ${user.email}\n`;
        }

        // Test Edge Function
        output.textContent += '\n3. Testing Edge Function...\n';
        const supabaseUrl = 'https://qkdrjsylfnravzhnlvcy.supabase.co';
        const response = await fetch(`${supabaseUrl}/functions/v1/ai-command`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: 'Test content',
            instruction: 'Make this bold',
          }),
        });

        output.textContent += `   Response status: ${response.status} ${response.statusText}\n`;
        
        const responseText = await response.text();
        output.textContent += `   Response body: ${responseText.substring(0, 200)}\n`;

        if (response.ok) {
          output.textContent += '✅ Edge Function call successful!\n';
        } else {
          output.textContent += '❌ Edge Function call failed!\n';
        }

      } catch (err) {
        output.textContent += `\n❌ Error: ${err.message}\n`;
        output.textContent += err.stack;
      }
    };
  </script>
</body>
</html>
```

## Still Not Working?

If you've tried everything above and it's still not working:

1. **Check Supabase project status**: https://status.supabase.com/
2. **Verify your Supabase project is active**: https://supabase.com/dashboard/project/qkdrjsylfnravzhnlvcy
3. **Check if you have multiple Supabase projects** and are using the wrong URL/keys
4. **Try creating a new session** by logging in from an incognito window

## Contact Support

If nothing works, collect these details:

1. Browser console logs (all `[AIAssistant]` and `[Auth]` entries)
2. Supabase Edge Function logs (from dashboard)
3. Network tab screenshot showing the failed request
4. Output from the "Check Your Current Session" script above
5. Your Supabase project URL (it's public, so safe to share)

Then reach out to Supabase support or check their Discord.
