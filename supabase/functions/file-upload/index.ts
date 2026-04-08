import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { getOpenAIClient } from '../_shared/openai.ts';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'docx', 'doc', 'txt', 'md', 'json',
  'jpg', 'jpeg', 'png', 'gif', 'webp',
]);

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Verify authentication
    await verifyAuth(req);

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: `File too large. Maximum size is 25MB, got ${(file.size / 1024 / 1024).toFixed(1)}MB` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file type
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return new Response(
        JSON.stringify({ error: `Unsupported file type: .${ext}. Supported: ${[...ALLOWED_EXTENSIONS].join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get OpenAI config
    const openaiConfig = await getOpenAIClient();

    // Upload to OpenAI /v1/files
    const uploadForm = new FormData();
    uploadForm.append('file', file, file.name);
    uploadForm.append('purpose', 'user_data');

    console.log('[file-upload] Uploading file to OpenAI:', file.name, `(${file.size} bytes)`);

    const response = await fetch(`${openaiConfig.baseUrl}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiConfig.apiKey}`,
      },
      body: uploadForm,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[file-upload] OpenAI upload failed:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Failed to upload file: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    console.log('[file-upload] File uploaded successfully:', result.id);

    return new Response(
      JSON.stringify({
        file_id: result.id,
        filename: result.filename,
        bytes: result.bytes,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[file-upload] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('Unauthorized') || message.includes('authorization') ? 401 : 500;

    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
