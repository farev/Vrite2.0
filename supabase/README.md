# Supabase Setup Guide

This directory contains the Supabase configuration for the Vrite application.

## Prerequisites

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Create a Supabase project at https://supabase.com

## Local Development Setup

### 1. Initialize Supabase

```bash
cd Vrite2.0
supabase init
```

### 2. Link to your Supabase project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Get your project ref from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/general

### 3. Start local Supabase

```bash
supabase start
```

This will start:
- PostgreSQL database (port 54322)
- Studio UI (http://localhost:54323)
- API Gateway (port 54321)
- Edge Functions runtime

### 4. Run migrations

```bash
supabase db reset
```

This applies all migrations in the `migrations/` directory.

### 5. Set up secrets

#### For local development:

Create a `.env` file in the `Vrite2.0/` directory:

```env
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key-from-supabase-start
SUPABASE_SERVICE_ROLE_KEY=your-service-key-from-supabase-start
OPENAI_API_KEY=sk-your-openai-key
```

#### For production:

Store the OpenAI API key in Supabase Vault:

```sql
SELECT vault.create_secret('sk-your-openai-api-key', 'openai_api_key');
```

Run this in the Supabase Dashboard SQL Editor with service role privileges.

### 6. Deploy Edge Functions locally

```bash
supabase functions serve
```

This serves all functions at:
- http://localhost:54321/functions/v1/ai-command
- http://localhost:54321/functions/v1/format-document
- http://localhost:54321/functions/v1/enhance-writing

## Production Deployment

### 1. Push database migrations

```bash
supabase db push
```

### 2. Set production secrets

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set GOOGLE_CLIENT_ID=...
supabase secrets set GOOGLE_CLIENT_SECRET=...
supabase secrets set MICROSOFT_CLIENT_ID=...
supabase secrets set MICROSOFT_CLIENT_SECRET=...
```

### 3. Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy

# Or deploy individually
supabase functions deploy ai-command
supabase functions deploy format-document
supabase functions deploy enhance-writing
```

### 4. Configure OAuth providers

In Supabase Dashboard → Authentication → Providers:

#### Google OAuth:
1. Create OAuth credentials in Google Cloud Console
2. Add redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Add scopes: `email`, `profile`, `https://www.googleapis.com/auth/drive.file`
4. Enter Client ID and Client Secret in Supabase

#### Microsoft OAuth:
1. Register app in Azure Portal
2. Add redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Add API permissions: `User.Read`, `Files.ReadWrite.All`
4. Enter Application ID and Client Secret in Supabase

## Database Schema

The migrations create the following tables:

- `public.users` - User profiles (extends auth.users)
- `public.documents` - Document storage with cloud sync metadata
- `public.document_versions` - Version history
- `public.user_integrations` - OAuth tokens for Google Drive/OneDrive
- `public.rate_limits` - Rate limiting tracking

All tables have Row Level Security (RLS) enabled with appropriate policies.

## Edge Functions

### ai-command
Processes AI document commands with conversation history and context snippets.

### format-document
Applies academic formatting (APA, MLA, Chicago) to documents.

### enhance-writing
Generates or enhances writing content based on prompts.

## Testing

Test Edge Functions locally:

```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/ai-command' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "content": "Test document",
    "instruction": "Make this more professional"
  }'
```

## Monitoring

View logs:

```bash
# Local
supabase functions logs

# Production
supabase functions logs --project-ref YOUR_PROJECT_REF
```

## Troubleshooting

### Edge Function errors

Check logs for detailed error messages:
```bash
supabase functions logs ai-command
```

### Database connection issues

Verify your connection string and ensure migrations are applied:
```bash
supabase db reset
```

### OAuth issues

Verify redirect URIs match exactly in both OAuth provider and Supabase settings.
