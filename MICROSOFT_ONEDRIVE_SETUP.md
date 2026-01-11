# Microsoft OneDrive Integration Setup Guide

This guide walks you through setting up Microsoft OAuth authentication and OneDrive storage support for Vrite.

## Overview

Vrite now supports both Google Drive and OneDrive as cloud storage providers. Users can choose to authenticate with either Google or Microsoft, and their documents will be stored in their preferred cloud storage.

## Prerequisites

- A Supabase project (create one at https://supabase.com)
- Access to Azure Portal (Microsoft account required)
- Your Vrite application running locally or deployed

## Part 1: Azure Portal Setup

### Step 1: Register Application

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **"New registration"**
4. Fill in the details:
   - **Name**: `Vrite`
   - **Supported account types**: `"Accounts in any organizational directory and personal Microsoft accounts"`
   - **Redirect URI**:
     - Platform: `Web`
     - URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
       - Replace `YOUR_PROJECT_REF` with your actual Supabase project ID
       - For local development, you might also want to add: `http://localhost:54321/auth/v1/callback`

### Step 2: Create Client Secret

1. In your app registration, go to **"Certificates & secrets"**
2. Click **"New client secret"**
3. Description: `"Vrite Production"`
4. Expiry: Choose appropriate expiry (e.g., 24 months)
5. Click **"Add"**
6. **IMPORTANT**: Copy the secret value immediately (you won't be able to see it again!)

### Step 3: Configure API Permissions

1. Go to **"API permissions"**
2. Click **"Add a permission"**
3. Select **"Microsoft Graph"**
4. Select **"Delegated permissions"**
5. Add these permissions:
   - `User.Read` (usually already added)
   - `Files.ReadWrite.All`
   - `offline_access` (for refresh tokens)
6. Click **"Add permissions"**
7. (Optional) Click **"Grant admin consent"** if you're an admin

### Step 4: Copy Application Details

Copy these values (you'll need them for Supabase):
- **Application (client) ID** from the app registration overview
- **Client Secret** value from step 2

## Part 2: Supabase Configuration

### Step 1: Enable Azure Provider

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Find **"Azure"** and click **"Enable"**

### Step 2: Configure Azure Settings

1. **Client ID**: Paste your Azure Application (client) ID
2. **Client Secret**: Paste your Azure client secret value
3. **Tenant**: Leave as `"common"` (for multi-tenant support)
4. Click **"Save"**

### Step 3: Update Site URL (if needed)

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL**:
   - Production: `https://your-domain.com`
   - Development: `http://localhost:3001`

## Part 3: Test the Integration

### Step 1: Start Your Application

```bash
cd Vrite2.0/vrite
npm run dev
```

### Step 2: Test Microsoft Login

1. Open your browser to `http://localhost:3001`
2. Click **"Continue with Microsoft"**
3. Sign in with your Microsoft account
4. Grant the requested permissions (profile, files access)
5. You should be redirected back to the app

### Step 3: Test Document Storage

1. Create a new document or edit existing content
2. Click **Save** (or wait for auto-save)
3. Check your OneDrive at [onedrive.live.com](https://onedrive.live.com)
4. You should see a `.md` file in your root folder

## How It Works

### Authentication Flow

```
User clicks "Continue with Microsoft"
    ↓
Microsoft OAuth consent screen
    ↓
User grants permissions
    ↓
Azure redirects to Supabase callback
    ↓
Supabase exchanges code for session + tokens
    ↓
App detects 'azure' provider in session
    ↓
Routes storage operations to OneDrive
```

### Storage Detection

The app automatically detects which provider you used to authenticate:

- **Google**: Routes to GoogleDriveClient
- **Microsoft**: Routes to OneDriveClient

All storage operations use the same interface, so the app works seamlessly regardless of provider choice.

## Troubleshooting

### "Invalid OAuth access token" Error

**Cause**: Missing or expired tokens
**Solution**:
- Log out and log back in
- Check that Azure permissions are granted
- Verify client secret is correct in Supabase

### Documents Not Appearing in OneDrive

**Cause**: API permissions not granted or insufficient scope
**Solution**:
- Check Azure API permissions include `Files.ReadWrite.All`
- Ensure admin consent is granted (if admin)
- Verify the redirect URI matches exactly

### "Provider not supported" Error

**Cause**: Session provider detection failed
**Solution**:
- Check Supabase logs for provider information
- Verify Azure provider is enabled and configured
- Clear browser cache and try again

### CORS Errors

**Cause**: Redirect URI mismatch
**Solution**:
- Verify redirect URI in Azure exactly matches Supabase callback URL
- Check Site URL configuration in Supabase
- For local development, ensure both local and production URIs are added

## File Structure

After setup, your documents will appear in OneDrive as:

```
📁 OneDrive Root
├── 📄 My Document.md
├── 📄 Another Document.md
└── 📄 Untitled Document.md
```

Each file contains your document content in Markdown format.

## Security Notes

- **Never commit secrets** to version control
- **Rotate client secrets** regularly
- **Use Vault** for production secrets in Supabase
- **Monitor OAuth logs** for suspicious activity
- **Limit scopes** to only what's necessary

## Next Steps

- Test with multiple users
- Verify document loading/saving works reliably
- Check that both Google and Microsoft providers work side-by-side
- Monitor Supabase authentication logs
- Consider implementing user provider preferences (optional)

---

**Need help?** Check the Supabase and Azure documentation, or review the console logs for detailed error messages.