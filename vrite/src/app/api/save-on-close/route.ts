import { NextRequest, NextResponse } from 'next/server';
import { saveDocument } from '@/lib/storage';
import type { DocumentData } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    // Handle sendBeacon data (could be FormData or JSON)
    let documentData: DocumentData;

    const contentType = request.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      // Direct JSON from sendBeacon
      documentData = await request.json();
    } else if (contentType?.includes('multipart/form-data') || contentType?.includes('application/x-www-form-urlencoded')) {
      // Form data fallback
      const formData = await request.formData();
      const jsonData = formData.get('data') as string;
      documentData = JSON.parse(jsonData);
    } else {
      // Try to parse as JSON directly
      const text = await request.text();
      documentData = JSON.parse(text);
    }

    console.log('[SaveOnClose] Received save request for:', documentData.title, 'ID:', documentData.id);

    // Only save if there's actual editor state or a title change
    if (documentData.editorState || documentData.title !== 'Untitled Document') {
      // Save the document
      const savedDoc = await saveDocument(documentData);
      console.log('[SaveOnClose] Document saved successfully, ID:', savedDoc.id);
    } else {
      console.log('[SaveOnClose] Skipping save - empty document');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[SaveOnClose] Failed to save document:', error);

    // Return success anyway since this is a best-effort save on close
    // We don't want to cause browser warnings
    return NextResponse.json({ success: false, error: 'Save failed but continuing' });
  }
}