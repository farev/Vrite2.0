import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, checkRateLimit } from '../_shared/auth.ts';
import { getOpenAIClient, createChatCompletion, type ChatMessage, type Tool } from '../_shared/openai.ts';

// ============== V2 System Prompt (Lexical JSON) ==============

const EDITOR_SYSTEM_PROMPT_V2 = `Document editing assistant. Use edit_document tool for ALL changes.

RULES:
- Be surgical - only change what's requested
- One block = one paragraph/heading/list-item
- NEVER use markdown (**, *) - use format bitmask
- For new content: insert_block for EACH block separately

FORMAT: {"blocks":[{"id":"block-0","type":"paragraph","segments":[{"text":"Hello","format":0}]}]}
Types: paragraph, heading (tag:h1/h2/h3), list-item (listType:bullet/number)
Format: 0=normal, 1=bold, 2=italic, 3=bold+italic

OPERATIONS:
- modify_segments: Edit text/format in block
- replace_block: Change block type
- insert_block: Add block (afterBlockId=null for start)
- delete_block: Remove block

LISTS: type="list-item" + listType. NEVER put "1." or "-" in text.

EDITING PRINCIPLES:
- Preserve the author's voice and style
- Make minimal necessary changes
- Only modify blocks that actually need changing
- Do NOT regenerate unchanged content

AFTER using tools, provide:
- "reasoning": Brief analysis of what changes were made and why (1-3 sentences)
- "summary": Concise statement of what was changed (no pleasantries)`;

// ============== V2 Tool Definition ==============

const EDIT_DOCUMENT_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'edit_document',
    description: `Edit the document using block-level operations. Each block has an 'id' for reference.

Operations:
- replace_block: Replace entire block with new content/type
- insert_block: Insert new block (use afterBlockId=null for start of document)
- delete_block: Remove a block
- modify_segments: Change text/formatting within a block

Format bitmask: 0=normal, 1=bold, 2=italic, 3=bold+italic, 4=underline`,
    parameters: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          description: 'List of changes to apply to the document',
          items: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['replace_block', 'insert_block', 'delete_block', 'modify_segments'],
                description: 'The type of operation to perform',
              },
              blockId: {
                type: 'string',
                description: 'ID of the block to modify (for replace/delete/modify operations)',
              },
              afterBlockId: {
                type: ['string', 'null'],
                description: 'ID of block to insert after. Use null to insert at the beginning (for insert_block only)',
              },
              newBlock: {
                type: 'object',
                description: 'The new block content (for replace_block and insert_block)',
                properties: {
                  id: { type: 'string', description: 'Unique ID for the block' },
                  type: { type: 'string', enum: ['paragraph', 'heading', 'list-item'] },
                  tag: { type: 'string', enum: ['h1', 'h2', 'h3'], description: 'Heading level (for headings only)' },
                  listType: { type: 'string', enum: ['bullet', 'number'], description: 'List type (for list-items only)' },
                  segments: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        text: { type: 'string' },
                        format: { type: 'integer', description: 'Format bitmask: 0=normal, 1=bold, 2=italic, 4=underline' },
                      },
                      required: ['text', 'format'],
                    },
                  },
                },
                required: ['id', 'type', 'segments'],
              },
              newSegments: {
                type: 'array',
                description: 'New text segments (for modify_segments only)',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    format: { type: 'integer' },
                  },
                  required: ['text', 'format'],
                },
              },
            },
            required: ['operation'],
          },
        },
      },
      required: ['changes'],
    },
  },
};

interface TextSegment {
  text: string;
  format: number;
}

interface SimplifiedBlock {
  id: string;
  type: 'paragraph' | 'heading' | 'list-item';
  tag?: 'h1' | 'h2' | 'h3';
  listType?: 'bullet' | 'number';
  indent?: number;
  segments: TextSegment[];
}

interface SimplifiedDocument {
  blocks: SimplifiedBlock[];
}

interface CommandRequest {
  document: SimplifiedDocument;
  instruction: string;
  conversation_history?: Array<{ role: string; content: string }>;
  context_snippets?: string[];
}

interface CommandResponse {
  type: string;
  reasoning?: string;
  changes?: any[];
  summary: string;
}

Deno.serve(async (req) => {
  console.log('=== AI Command Function Started (V2 Lexical) ===');
  console.log('[ai-command] Request method:', req.method);
  console.log('[ai-command] Request URL:', req.url);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('[ai-command] Handling CORS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[ai-command] Starting authentication verification...');
    // Verify authentication
    const { user, supabase } = await verifyAuth(req);
    console.log('[ai-command] ✅ Authentication successful for user:', user.id);
    console.log('[ai-command] User email:', user.email);

    // Check rate limit (10 requests per minute)
    console.log('[ai-command] Checking rate limit for user:', user.id);
    const isAllowed = await checkRateLimit(user.id, 'ai-command', supabase, 10, 60);
    console.log('[ai-command] Rate limit check result:', isAllowed ? 'ALLOWED' : 'BLOCKED');

    if (!isAllowed) {
      console.warn('[ai-command] ⚠️ Rate limit exceeded for user:', user.id);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait before making more requests.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    console.log('[ai-command] Parsing request body...');
    const requestData: CommandRequest = await req.json();
    const { document, instruction, conversation_history, context_snippets } = requestData;

    console.log('[ai-command] Request data received:');
    console.log('  - Document blocks:', document?.blocks?.length || 0);
    console.log('  - Instruction:', instruction?.substring(0, 100) || 'MISSING');
    console.log('  - Conversation history length:', conversation_history?.length || 0);
    console.log('  - Context snippets:', context_snippets?.length || 0);

    if (!instruction?.trim() || !document) {
      console.error('[ai-command] ❌ Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: document and instruction' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get OpenAI client
    console.log('[ai-command] Retrieving OpenAI configuration...');
    const openaiConfig = await getOpenAIClient();
    console.log('[ai-command] ✅ OpenAI configuration retrieved successfully');

    // Build messages array
    const messages: ChatMessage[] = [];

    // Add system message
    messages.push({
      role: 'system',
      content: EDITOR_SYSTEM_PROMPT_V2,
    });
    console.log('[ai-command] Added system message');

    // Add conversation history (limit to last 7 exchanges = 14 messages)
    if (conversation_history && conversation_history.length > 0) {
      const recentHistory = conversation_history.slice(-14);
      messages.push(...recentHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })));
      console.log('[ai-command] Added', recentHistory.length, 'conversation history messages');
    }

    // Build document JSON representation
    const docJson = JSON.stringify(document, null, 2);

    // Build context text from snippets
    let contextText = '';
    if (context_snippets && context_snippets.length > 0) {
      const cleanedSnippets = context_snippets.filter(s => s.trim());
      if (cleanedSnippets.length > 0) {
        const formattedSnippets = cleanedSnippets.map(s => `- ${s}`).join('\n');
        contextText = `Priority context from the user:\n${formattedSnippets}\n\n`;
        console.log('[ai-command] Added', cleanedSnippets.length, 'context snippets');
      }
    }

    // Check if document is blank or nearly blank
    const isBlank = document.blocks.length === 0 || (
      document.blocks.length === 1 &&
      document.blocks[0].segments.every(s => s.text.trim() === '')
    );
    const blankNote = isBlank
      ? '\n\nIMPORTANT: The document is BLANK. You MUST use multiple insert_block operations (one per paragraph/heading/list-item). Do NOT use modify_segments. Create each piece of content as a separate block with its own insert_block operation.'
      : '';

    console.log('[ai-command] Document is blank:', isBlank);

    messages.push({
      role: 'user',
      content: `${contextText}Document (Lexical JSON):
${docJson}${blankNote}

User instruction: ${instruction}

Use the edit_document tool to make changes, then provide reasoning and summary.`,
    });
    console.log('[ai-command] Total messages prepared:', messages.length);

    // Make OpenAI API call
    console.log('[ai-command] Making OpenAI API call with model: gpt-4o-mini');
    const response = await createChatCompletion(openaiConfig, {
      model: 'gpt-4o-mini',
      messages,
      tools: [EDIT_DOCUMENT_TOOL],
      tool_choice: 'auto',
      max_tokens: 16384,
      temperature: 0.3,
    });
    console.log('[ai-command] ✅ OpenAI API call completed successfully');

    const message = response.choices[0].message;
    const finishReason = response.choices[0].finish_reason;
    const toolCalls = message.tool_calls || [];

    console.log('[ai-command] Finish reason:', finishReason);
    console.log('[ai-command] Tool calls received:', toolCalls.length);

    // Check if response was truncated
    if (finishReason === 'length') {
      throw new Error('Response was truncated due to length. Try a simpler request.');
    }

    // Extract changes from tool calls
    const changes: any[] = [];
    for (const toolCall of toolCalls) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        if (toolCall.function.name === 'edit_document') {
          changes.push(...(args.changes || []));
          console.log('[ai-command] Extracted', args.changes?.length || 0, 'changes from tool call');
        }
      } catch (error) {
        console.error('[ai-command] JSON parse error:', error);
        throw new Error('Model returned malformed JSON. Try a simpler request or break it into smaller steps.');
      }
    }
    console.log('[ai-command] Total changes extracted:', changes.length);

    // Get reasoning and summary
    let reasoning = '';
    let summary = '';

    if (toolCalls.length > 0) {
      console.log('[ai-command] Processing tool calls for reasoning and summary...');
      // Add tool call and responses to messages
      messages.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        messages.push({
          role: 'tool',
          content: 'Applied successfully',
          tool_call_id: toolCall.id,
        });
      }

      // Request final JSON response
      messages.push({
        role: 'user',
        content: 'Now provide your reasoning and summary in JSON format with fields: reasoning, summary',
      });

      console.log('[ai-command] Requesting final reasoning/summary from OpenAI...');
      const finalResponse = await createChatCompletion(openaiConfig, {
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 500,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(finalResponse.choices[0].message.content || '{}');
      reasoning = result.reasoning || '';
      summary = result.summary || 'Changes applied.';
      console.log('[ai-command] Reasoning:', reasoning?.substring(0, 100));
      console.log('[ai-command] Summary:', summary?.substring(0, 100));
    } else {
      // No tool calls - fallback
      console.log('[ai-command] No tool calls, using fallback mode');
      summary = message.content || 'No changes needed.';
      console.log('[ai-command] Fallback summary:', summary?.substring(0, 100));
    }

    // Return response
    const responseData: CommandResponse = changes.length > 0
      ? {
          type: 'lexical_changes',
          reasoning,
          changes,
          summary,
        }
      : {
          type: 'no_changes',
          summary,
          reasoning,
        };

    console.log('[ai-command] Response type:', responseData.type);
    console.log('[ai-command] Response changes count:', changes.length);
    console.log('[ai-command] ✅ Request completed successfully');
    console.log('=== AI Command Function Completed ===');

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== AI Command Function ERROR ===');
    console.error('[ai-command] ❌ Error type:', error?.constructor?.name);
    console.error('[ai-command] ❌ Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('[ai-command] ❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = errorMessage.includes('Unauthorized') || errorMessage.includes('authorization') ? 401 : 500;

    console.error('[ai-command] Returning error response with status:', statusCode);
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
