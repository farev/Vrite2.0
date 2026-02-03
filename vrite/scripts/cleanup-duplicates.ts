/**
 * Utility script to find and remove duplicate documents from Supabase
 * Run with: npx tsx scripts/cleanup-duplicates.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function findDuplicates() {
  console.log('🔍 Searching for duplicate documents...\n');

  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, user_id, title, last_modified, storage_provider')
    .eq('is_deleted', false)
    .order('last_modified', { ascending: false });

  if (error) {
    console.error('Error fetching documents:', error);
    return;
  }

  if (!documents || documents.length === 0) {
    console.log('No documents found.');
    return;
  }

  console.log(`Found ${documents.length} total documents\n`);

  // Group documents by user_id and title
  const groupedByUser = new Map<string, Map<string, typeof documents>>();

  documents.forEach(doc => {
    if (!groupedByUser.has(doc.user_id)) {
      groupedByUser.set(doc.user_id, new Map());
    }
    const userDocs = groupedByUser.get(doc.user_id)!;

    if (!userDocs.has(doc.title)) {
      userDocs.set(doc.title, []);
    }
    userDocs.get(doc.title)!.push(doc);
  });

  // Find duplicates
  let totalDuplicates = 0;
  const duplicatesToDelete: string[] = [];

  groupedByUser.forEach((userDocs, userId) => {
    userDocs.forEach((docs, title) => {
      if (docs.length > 1) {
        totalDuplicates += docs.length - 1;
        console.log(`📋 User ${userId} has ${docs.length} copies of "${title}":`);

        // Sort by last_modified (descending) - keep the most recent
        docs.sort((a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime());

        docs.forEach((doc, index) => {
          if (index === 0) {
            console.log(`  ✅ Keep: ${doc.id} (${new Date(doc.last_modified).toLocaleString()}) [MOST RECENT]`);
          } else {
            console.log(`  ❌ Delete: ${doc.id} (${new Date(doc.last_modified).toLocaleString()})`);
            duplicatesToDelete.push(doc.id);
          }
        });
        console.log('');
      }
    });
  });

  if (totalDuplicates === 0) {
    console.log('✨ No duplicates found!');
    return;
  }

  console.log(`\n📊 Summary: Found ${totalDuplicates} duplicate documents`);
  console.log(`\nTo remove duplicates, run: npx tsx scripts/cleanup-duplicates.ts --delete`);

  // If --delete flag is provided, delete the duplicates
  if (process.argv.includes('--delete')) {
    console.log('\n⚠️  Deleting duplicates...');

    // Soft delete by setting is_deleted = true
    const { error: deleteError } = await supabase
      .from('documents')
      .update({ is_deleted: true })
      .in('id', duplicatesToDelete);

    if (deleteError) {
      console.error('Error deleting duplicates:', deleteError);
      return;
    }

    console.log(`✅ Successfully marked ${duplicatesToDelete.length} documents as deleted`);
  }
}

findDuplicates().catch(console.error);
