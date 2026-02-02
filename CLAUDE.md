# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vrite 2.0 is an AI-powered document editor built with Next.js 15, Lexical editor, and Supabase. It features rich text editing, AI assistance, academic formatting, and cloud storage integration.

## Development Commands

### Local Development Setup

```bash
# Start Supabase local environment (from root directory)
supabase start

# Apply database migrations
supabase db reset

# Start Next.js dev server (from vrite/ directory)
cd vrite
npm run dev
```

The app runs on http://localhost:3001 (not 3000).

### Build & Lint

```bash
# Build for production (uses Turbopack)
npm run build

# Run ESLint
npm run lint

# Start production server
npm start
```

### Supabase Edge Functions

```bash
# Serve functions locally
supabase functions serve

# Deploy to production
supabase functions deploy

# Test a specific function
curl -i --location --request POST 'http://localhost:54321/functions/v1/ai-command' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"content": "Test", "instruction": "Make professional"}'
```

Available Edge Functions:
- `ai-command` - Main AI document editing
- `autocomplete` - AI text completion suggestions
- `enhance-writing` - Content generation
- `format-document` - Academic formatting (APA, MLA, Chicago)

## Architecture

### Monorepo Structure

This is a monorepo with multiple related projects:
- `vrite/` - Main Next.js frontend application
- `supabase/` - Database migrations and Edge Functions
- `backend/` - Legacy backend (being phased out)

The working directory is set to `/frontend` which contains all three subdirectories.

### Key Directories

```
vrite/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx           # Home page (document list + migration)
│   │   ├── document/[id]/     # Document editor page
│   │   ├── auth/callback/     # OAuth callback handler
│   │   └── api/               # API routes (export, save)
│   ├── components/
│   │   ├── DocumentEditor.tsx # Main Lexical editor
│   │   ├── AIAssistantSidebar.tsx # AI chat interface
│   │   ├── MenuBar.tsx        # File operations toolbar
│   │   ├── FormattingToolbar.tsx # Rich text formatting
│   │   ├── nodes/             # Custom Lexical nodes
│   │   │   ├── DiffNode.tsx   # AI change preview
│   │   │   ├── EquationNode.tsx # LaTeX equations
│   │   │   ├── AutocompleteNode.tsx
│   │   │   └── PageBreakNode.tsx
│   │   └── plugins/           # Lexical plugins
│   │       ├── DiffPlugin.tsx
│   │       ├── PaginationPlugin.tsx
│   │       ├── MarkdownPlugin.tsx
│   │       ├── ClipboardPlugin.tsx
│   │       └── AutocompletePlugin.tsx
│   ├── lib/
│   │   ├── storage.ts         # Storage abstraction layer
│   │   ├── google-drive.ts    # Google Drive API client
│   │   ├── storage-supabase.ts # Supabase storage client
│   │   ├── lexicalSerializer.ts # Lexical ↔ SimplifiedDocument
│   │   ├── migrate-supabase-to-cloud.ts # Migration logic
│   │   └── supabase/          # Supabase client setup
│   └── contexts/
│       └── AuthContext.tsx    # Global auth state
supabase/
├── functions/                  # Edge Functions (Deno runtime)
│   ├── _shared/               # Shared utilities
│   └── ai-command/            # Main AI processing
└── migrations/                # Database schema
```

### Authentication & Storage Flow

**Three-tier storage system:**

1. **Anonymous Users (Temporary Documents)**
   - Document ID format: `temp-{timestamp}-{random}`
   - Storage: Browser localStorage
   - Limitations: No cloud sync, lost on cache clear

2. **Authenticated (No OAuth)**
   - Supabase anonymous session
   - Storage: Supabase `public.documents` table
   - Access: Row Level Security (RLS) by user_id

3. **Authenticated with OAuth (Primary)**
   - Google OAuth with Drive scope
   - Storage: Google Drive `/vwrite` folder as `.md` files
   - Session: `session.provider_token` indicates Drive access
   - Migration: Automatic on home page after OAuth callback

**Authentication Flow:**
```
User signs in → Google OAuth → /auth/callback
  → Sets cookie: needs_migration_check=true
  → Redirect to home page
  → Home page detects migration flag
  → Runs migrateSupabaseToCloud()
  → Migrates localStorage/Supabase → Google Drive
```

**Key Auth Context States:**
- `isAuthenticated`: Has `provider_token` (OAuth successful)
- `isAnonymous`: Has session but no `provider_token`
- `showSignupModal(trigger)`: Displays modal for save/ai-limit/storage-full

### Lexical Editor Architecture

**Custom Nodes:**
- `DiffNode` - Shows AI-generated changes with accept/reject UI
- `EquationNode` - LaTeX equations rendered with KaTeX
- `AutocompleteNode` - Ghost text suggestions
- `PageBreakNode` - Page break markers

**Serialization Formats:**

1. **Full Lexical JSON** (stored in database)
   - Preserves all formatting, nested structures
   - Used for exact editor state restoration

2. **SimplifiedDocument** (sent to AI)
   ```typescript
   {
     blocks: [{
       id: "block-0",
       type: "paragraph" | "heading" | "list-item",
       tag?: "h1" | "h2" | "h3",
       segments: [{ text: "...", format: 0-7 }],
       listType?: "bullet" | "number"
     }]
   }
   ```
   - Format bitmask: 0=normal, 1=bold, 2=italic, 4=underline

3. **LexicalChanges** (returned from AI)
   - Block-level operations: modify_segments, replace_block, insert_block, delete_block
   - Applied precisely to editor state

### Cloud Storage Integration

**Google Drive Client** (`src/lib/google-drive.ts`):
- Uses Drive API v3 directly via fetch
- All documents stored in `/vwrite` folder
- File format: `{title}.md` with markdown content
- Includes metadata: file ID, modification time

**OneDrive**: Interface prepared but not fully integrated

**Auto-save Logic:**
- Interval: 30 seconds
- Only saves if `hasUnsavedChanges = true`
- Triggered by: editor changes or title changes
- Clears flag after successful save

### AI Features

**Edge Function: `ai-command`**
- Input: SimplifiedDocument + instruction + optional context
- Uses OpenAI GPT-4 with function calling
- Tool: `edit_document` with precise block-level operations
- Output: LexicalChanges array
- Applied via DiffPlugin (shows preview, accept/reject)

**AI Sidebar** (`src/components/AIAssistantSidebar.tsx`):
- Multi-turn conversation UI
- Context snippets: selected text auto-added
- Diff preview before/after
- Accept/Reject buttons
- Signup modal for anonymous users hitting limits

### Multi-Tab Synchronization

**For temporary documents only** (`useDocumentSync` hook):
- Listens to `storage` events
- Detects modifications in other tabs
- Prompts: reload with new version or keep local
- Only applies to `temp-*` documents in localStorage

## Important Patterns

### Storage Abstraction Layer

Always use `src/lib/storage.ts` which routes to the correct storage provider:
```typescript
// DON'T call GoogleDriveClient directly
// DO use storage layer
import { saveDocument, loadDocument } from '@/lib/storage'
```

### Migration Cascades

The migration happens automatically when:
1. User signs in with OAuth
2. `/auth/callback` sets cookie `needs_migration_check=true`
3. Home page (`/`) detects cookie
4. Calls `migrateSupabaseToCloud()` before rendering
5. Moves all documents: localStorage → Supabase → Google Drive

### Document ID Patterns

- Temporary: `temp-{timestamp}-{random}`
- Supabase: UUID format
- Google Drive: Google's file ID (alphanumeric)

Check document type:
```typescript
const isTemp = documentId.startsWith('temp-')
```

### Signup Modal Triggers

Use `showSignupModal(trigger)` from AuthContext:
- `'save'` - User tried to save without login
- `'ai-success'` - After successful AI operation
- `'ai-limit-reached'` - Rate limit hit
- `'storage-full'` - Storage quota exceeded

## Common Tasks

### Adding a New Lexical Plugin

1. Create plugin file in `src/components/plugins/`
2. Import and register in `DocumentEditor.tsx`:
   ```typescript
   <YourPlugin />
   ```
3. If it needs nodes, add to `initialConfig.nodes` array
4. Test with save/reload to ensure serialization works

### Adding a New AI Feature

1. Create or modify Edge Function in `supabase/functions/`
2. Update AI sidebar or create new UI component
3. Use SimplifiedDocument format for input
4. Return LexicalChanges for precise editor updates
5. Add rate limiting via `checkRateLimit()`

### Modifying Storage Behavior

1. Update storage interface in `src/lib/storage.ts`
2. Implement in both `google-drive.ts` and `storage-supabase.ts`
3. Ensure localStorage fallback for anonymous users
4. Test migration flow: temp → Supabase → Drive

### Adding Export Formats

1. Create API route in `src/app/api/export/[format]/`
2. Convert editor HTML or Lexical state to target format
3. Return file with proper MIME type
4. Wire up in `MenuBar.tsx` export dropdown

## Database Schema

**Key Tables:**
- `auth.users` - Supabase managed
- `public.users` - Extended profile (full_name, avatar_url)
- `public.documents` - Document storage
  - Fields: id, user_id, title, content (markdown), editor_state (Lexical JSON), storage_provider, storage_id, storage_metadata, last_modified
  - `storage_provider`: 'supabase' | 'google_drive' | 'onedrive'
- `public.document_versions` - Version history (not fully utilized yet)
- `public.user_integrations` - OAuth tokens for cloud services
- `public.rate_limits` - API rate limiting

**RLS Policies:** All tables restrict access to documents where `user_id = auth.uid()`

## Environment Variables

Create `.env.local` in `vrite/`:
```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

Get keys from: `supabase status` after `supabase start`

OpenAI API key is stored in Supabase Vault:
```sql
SELECT vault.create_secret('sk-your-key', 'openai_api_key');
```

## Testing

### Local Testing Checklist

1. Anonymous flow: Create temp doc → Edit → Save button triggers signup
2. OAuth flow: Sign in → Migration runs → Documents in Drive
3. AI features: Cmd+K → Ask instruction → Preview diff → Accept/Reject
4. Export: File menu → Export as PDF/DOCX/TXT
5. Multi-tab: Open same temp doc in two tabs → Edit in one → Reload prompt in other
6. Formatting: Test all toolbar buttons → Save → Reload → Verify persistence

### Edge Function Testing

Use `supabase functions serve` then:
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/ai-command' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "simplifiedDocument": {...},
    "instruction": "Make more professional",
    "context": "This is a business email"
  }'
```

## Known Limitations

1. **OneDrive**: Interface exists but not fully integrated
2. **Autocomplete**: Implemented but disabled by default (`AutocompletePlugin` has `enabled={false}`)
3. **Version History**: Table exists but UI not implemented
4. **Real-time Collaboration**: Not yet implemented
5. **DOCX Import**: Not implemented (export only)

## Deployment

### Production Deployment

**Supabase:**
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy
supabase secrets set OPENAI_API_KEY=sk-...
```

**Vercel (Frontend):**
```bash
cd vrite
vercel
```

Add environment variables in Vercel dashboard (same as `.env.local`).

## Code Style & Conventions

- Use TypeScript strict mode
- Prefer functional components with hooks
- Use `async/await` over `.then()`
- Error handling: Try-catch with user-friendly messages
- File naming: PascalCase for components, kebab-case for utilities
- Export components as default, utilities as named exports

## Related Documentation

- **README.md** - Project overview and setup
- **STORAGE_EXPLANATION.md** - Storage architecture details
- **IMPLEMENTATION_SUMMARY 2.md** - Detailed feature implementation log
- **supabase/README.md** - Supabase development guide (if exists)
