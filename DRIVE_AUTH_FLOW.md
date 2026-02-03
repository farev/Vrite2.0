# Intelligent Google Drive Authentication Flow

## Overview

The app now intelligently handles missing Google Drive access tokens by distinguishing between two scenarios:

1. **Token Expired** (user previously had Drive access) → Auto-redirect to sign-in
2. **Never Granted Permissions** (first-time user or denied permissions) → Show toast notification

## How It Works

### 1. Detection Logic (`page.tsx:34-71`)

When a user signs in with Google but has no `provider_token`:

```typescript
// Check if user has ever connected Drive before
const hadDrivePreviously = await hasEverConnectedDrive(session.user.id);

if (hadDrivePreviously) {
  // Token expired - auto redirect to sign in
  // Initiates OAuth flow automatically
} else {
  // User never granted Drive permissions
  // Show toast notification in top-right corner
}
```

### 2. Database Tracking (`user_integrations` table)

The system tracks successful Drive connections in the `user_integrations` table:

- **On successful OAuth**: Records entry with `provider = 'google_drive'`
- **On missing token**: Checks if entry exists to determine if this is a re-auth scenario

### 3. User Experience

#### Scenario A: Token Expired (Returning User)
1. User lands on homepage
2. System detects: Has Google account + No token + Previous Drive record
3. **Automatic redirect** to Google sign-in (no user action needed)
4. User grants permissions
5. Redirected back to homepage with working Drive access

#### Scenario B: Never Granted Permissions (New User)
1. User lands on homepage
2. System detects: Has Google account + No token + No Drive record
3. **Toast notification** appears in top-right corner
4. Toast message: "Your documents won't sync to Google Drive"
5. User can click "Enable Google Drive →" to grant permissions
6. Or dismiss the toast to continue without Drive sync

## Component Structure

### New Files

1. **`src/lib/check-drive-integration.ts`**
   - `hasEverConnectedDrive(userId)` - Checks user_integrations table
   - `recordDriveConnection(userId, email)` - Records successful connection

2. **`src/components/DrivePermissionsToast.tsx`**
   - Toast notification component (top-right, dismissible)
   - Shows for users who never granted Drive permissions
   - Can be dismissed for the session (stored in sessionStorage)

### Modified Files

1. **`src/app/page.tsx`**
   - Added `handleMissingDriveToken()` function
   - Replaced modal prompt with intelligent detection
   - Shows toast for never-granted scenario
   - Auto-redirects for expired-token scenario

2. **`src/app/auth/callback/route.ts`**
   - Records Drive connection after successful OAuth
   - Stores provider_email for reference

3. **`src/components/HomePage.tsx`**
   - Removed warning banner (no longer needed)
   - Kept deduplication logic for document list

## Benefits

### User Experience
- **Seamless re-authentication**: No extra clicks for expired tokens
- **Non-intrusive notifications**: Toast instead of blocking modal
- **Clear communication**: Different messages for different scenarios

### Technical
- **No false positives**: Won't auto-redirect users who intentionally didn't grant permissions
- **Session memory**: Dismissed toast won't show again until next session
- **Database-backed**: Reliable tracking across sessions and devices

## Edge Cases Handled

1. **OAuth redirect loop**: Only auto-redirects if user had Drive before
2. **User dismisses toast**: Stored in sessionStorage, won't show again
3. **User changes mind**: Can manually click toast to enable Drive later
4. **Multiple tabs**: Toast behavior isolated per tab/session
5. **Database query failure**: Falls back to showing toast (safe default)

## Testing Checklist

### Test Scenario 1: New User (Never Granted)
- [ ] Sign in with Google (deny Drive permissions)
- [ ] Should see toast notification in top-right
- [ ] Click "Enable Google Drive" → Opens OAuth modal
- [ ] Dismiss toast → Doesn't show again this session

### Test Scenario 2: Returning User (Token Expired)
- [ ] Sign in with Google (grant Drive permissions)
- [ ] Wait for token to expire OR manually clear provider_token
- [ ] Refresh page → Should auto-redirect to Google sign-in
- [ ] Grant permissions → Redirected back with working Drive

### Test Scenario 3: Database Tracking
- [ ] Check `user_integrations` table after OAuth
- [ ] Should have record with `provider = 'google_drive'`
- [ ] Record persists across sessions

## Console Logs

Helpful logs to track behavior:

```
[Home] User has Google account but no provider token
[Home] Drive token expired, redirecting to sign in...
  OR
[Home] User never granted Drive permissions, showing notification

[DriveIntegration] Successfully recorded Drive connection
[AuthCallback] Recorded Drive connection for user
```

## Future Enhancements

- Add "Don't ask again" option to toast (store in localStorage)
- Show Drive sync status indicator in UI
- Add manual "Connect Drive" button in settings
- Track token expiration time for proactive refresh
