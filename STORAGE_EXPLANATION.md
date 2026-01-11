# Storage Architecture & Auto-Save Behavior

## Changes Made: Smart Auto-Save

### Previous Behavior ❌
- Auto-save triggered **every 30 seconds** regardless of whether changes were made
- This caused unnecessary API calls to Google Drive/OneDrive
- Wasted bandwidth and API quota

### New Behavior ✅
- Auto-save **only triggers when there are unsaved changes**
- Changes are tracked when:
  - User edits document content
  - User changes document title
- After successful save, the "unsaved changes" flag is cleared
- Manual save (Ctrl+S or Save button) still works anytime

### Implementation Details
Added `hasUnsavedChanges` state that:
1. Gets set to `true` when `handleEditorChange` is called (user types)
2. Gets set to `true` when document title changes
3. Gets set to `false` after successful save
4. Auto-save interval checks this flag before saving

---

## Storage Architecture Explanation

### Current Implementation: Cloud Storage Only

Your app currently uses **Google Drive and OneDrive** as the primary storage:

```
User Login (OAuth)
    ↓
Supabase Auth provides OAuth tokens
    ↓
Documents saved to Google Drive/OneDrive as .md files
    ↓
Loaded back on next session
```

**Files saved:**
- Location: User's Google Drive or OneDrive
- Format: `.md` (Markdown)
- Access: Via OAuth tokens stored in Supabase session

### What is Supabase Storage For?

According to your database schema, there are **3 storage provider options**:

#### 1. **Google Drive** (Currently Implemented ✅)
- Saves to user's Google Drive
- Requires Google OAuth
- Files stored in user's own Drive account

#### 2. **OneDrive** (Currently Implemented ✅)
- Saves to user's OneDrive
- Requires Microsoft OAuth
- Files stored in user's own OneDrive account

#### 3. **Supabase Storage** (Not Yet Implemented ⚠️)
- Would save to Supabase's built-in file storage
- No external OAuth needed
- Files stored in your Supabase project
- Useful for:
  - Users without Google/Microsoft accounts
  - Fallback when OAuth fails
  - Simpler authentication flow
  - Better control over storage

### Database Schema Support

Your `documents` table already has fields for this:

```sql
CREATE TABLE public.documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Document',
  content TEXT,                    -- Markdown content
  editor_state JSONB,              -- Lexical editor state
  storage_provider storage_provider DEFAULT 'supabase',  -- 👈 Can be 'supabase', 'google_drive', or 'onedrive'
  storage_id TEXT,                 -- External file ID (Drive/OneDrive)
  storage_metadata JSONB,          -- File metadata from cloud provider
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);
```

### Why Implement Supabase Storage?

**Pros:**
- ✅ Simpler user experience (no OAuth flow)
- ✅ Works for users without Google/Microsoft accounts
- ✅ Faster initial setup
- ✅ Better control over data
- ✅ Built-in versioning support
- ✅ Easier to implement collaboration features

**Cons:**
- ❌ Storage costs (though Supabase free tier is generous)
- ❌ Users don't have files in their familiar cloud storage
- ❌ Need to implement your own sync/backup

### How to Implement Supabase Storage

If you want to add Supabase storage as an option, you would:

1. **Create a new storage client** (`lib/supabase-storage.ts`)
2. **Use Supabase Storage API** to save/load documents
3. **Store documents in the `documents` table** (content in TEXT field)
4. **Let users choose their preferred storage** in settings
5. **Implement sync** between providers if needed

Example code structure:
```typescript
// lib/supabase-storage.ts
export class SupabaseStorageClient {
  async saveDocument(data: DocumentData) {
    // Save to documents table
    const { data: doc, error } = await supabase
      .from('documents')
      .upsert({
        id: data.id,
        title: data.title,
        content: data.content,
        editor_state: data.editorState,
        storage_provider: 'supabase',
        last_modified: new Date(data.lastModified)
      });
    
    return doc;
  }
  
  async loadDocument(id: string) {
    // Load from documents table
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();
    
    return data;
  }
}
```

---

## Summary

1. **Auto-save now only runs when there are actual changes** ✅
2. **Supabase Storage is configured but not implemented** - it's an alternative to Google Drive/OneDrive
3. **Current storage uses Google Drive/OneDrive exclusively** via OAuth tokens
4. **You can add Supabase storage** as a third option if you want a simpler auth flow
