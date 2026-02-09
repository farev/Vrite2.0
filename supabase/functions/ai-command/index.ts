import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, checkRateLimit } from '../_shared/auth.ts';
import { getOpenAIClient, createChatCompletion, createChatCompletionStream, type ChatMessage, type Tool, type ChatCompletionChunk } from '../_shared/openai.ts';

// ============== Formatting Standards ==============

const FORMATTING_STANDARDS = `
APA 7th: Title page (bold title), running head, Level 1-2 headings (centered/left bold), double-space, 0.5" indent
MLA 9th: Header (last name + page), first page heading, centered title, double-space, 0.5" indent
Chicago 17th: Title page (title 1/3 down), footnotes/endnotes, bibliography hanging indent
IEEE: Section numbering, column format, citation brackets
`;

// ============== V2 System Prompt (Lexical JSON) ==============

const EDITOR_SYSTEM_PROMPT_V2 = `You are the best document editing assistant called Vrite.

CRITICAL WORKFLOW - YOU MUST FOLLOW THIS EXACT ORDER:

Step 1 - EXPLANATION (as text content):
Write 1-2 sentences explaining what you plan to do. Output this as regular text, NOT as JSON or tool arguments.
Example: "I'll apply bold formatting to the first paragraph."

Step 2 - TOOL EXECUTION (as function call):
Use the edit_document FUNCTION CALL (not text) to make your changes. The system will handle this automatically.
DO NOT write JSON in your text response - use the actual function calling mechanism.

Step 3 - SUMMARY (provided after tool execution):
After the tool completes, you'll be asked for a summary. Keep it brief.

REMEMBER: Your initial response should contain ONLY the explanation text, followed by the function call. DO NOT include JSON or code blocks in your text content.

RULES:
- Be surgical - only change what's requested
- One block = one paragraph/heading/list-item
- NEVER use markdown (**, *) - use format bitmask
- For new content: insert_block for EACH block separately

FORMAT: {"blocks":[{"id":"block-0","type":"paragraph","segments":[{"text":"Hello","format":0}]}]}
Types: paragraph, heading (tag:h1/h2/h3), list-item (listType:bullet/number)
Format: 0=normal, 1=bold, 2=italic, 3=bold+italic
Alignment: Use "align" property - "left" (default), "center", "right", "justify"

OPERATIONS:
- modify_segments: Edit text/format in block
- replace_block: Change block type (use SAME ID as existing block, just change the type/content)
- insert_block: Add block (afterBlockId=null for start, or use ID of existing block to insert after it)
- delete_block: Remove block

CRITICAL BLOCK ID RULES:
- ONLY use block IDs that exist in the input document (e.g., if document has block-0, block-1, block-2, you can ONLY reference those)
- For modify_segments, replace_block, delete_block: blockId MUST be from the input document
- For insert_block: create a NEW unique ID (e.g., "new-block-1", "new-block-2") for the newBlock
- For replace_block: keep the SAME blockId but provide newBlock with updated content/type
- NEVER reference block IDs that don't exist in the input (e.g., don't use block-3 if only block-0, block-1, block-2 exist)

LISTS: type="list-item" + listType. NEVER put "1." or "-" in text.

ALIGNMENT: Use "align" property to set text alignment:
- "center": For titles, headings, centered content
- "right": For dates, signatures, right-aligned content
- "justify": For body paragraphs (formal documents)
- "left" or omit: Default left alignment
Example: {"id":"block-0","type":"heading","tag":"h1","align":"center","segments":[...]}
DO NOT write about alignment in the text - SET the align property instead!

EDITING PRINCIPLES:
- Preserve the author's voice and style
- Make minimal necessary changes
- Only modify blocks that actually need changing
- Do NOT regenerate unchanged content

EQUATION SUPPORT:

CRITICAL: Equations are SEGMENTS, not blocks. Put equations INSIDE the segments array.

1. STANDALONE EQUATIONS (paragraph with only an equation segment):
{
  "operation": "insert_block",
  "afterBlockId": "block-2",
  "newBlock": {
    "id": "new-eq-1",
    "type": "paragraph",
    "align": "center",
    "segments": [
      { "type": "equation", "equation": "x = \\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}" }
    ]
  }
}
NOTE: The equation goes IN segments array! Do NOT use equationData field.

2. INLINE EQUATIONS (equation within text):
{
  "operation": "modify_segments",
  "blockId": "block-0",
  "newSegments": [
    { "text": "Einstein's equation ", "format": 0 },
    { "type": "equation", "equation": "E=mc^2" },
    { "text": " is famous.", "format": 0 }
  ]
}

LaTeX Syntax Examples (MUST MATCH BRACES):
- Fractions: \\\\frac{numerator}{denominator} (2 pairs of braces!)
- Square root: \\\\sqrt{x} or \\\\sqrt[n]{x}
- Exponents: x^2 (single char) or x^{2+3} (multi-char needs braces)
- Subscripts: x_i (single char) or x_{i+1} (multi-char needs braces)
- Summation: \\\\sum_{i=1}^{n} x_i (note: subscript and superscript both have braces)
- Integration: \\\\int_0^\\\\infty f(x)\\\\,dx (note the spacing)
- Greek letters: \\\\alpha, \\\\beta, \\\\gamma, \\\\pi
- Matrices: \\\\begin{bmatrix} a & b \\\\\\\\ c & d \\\\end{bmatrix}

More Complex Examples:
- Quadratic formula: x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}
- Pythagorean: a^2 + b^2 = c^2
- Derivative: f'(x) = \\\\lim_{h \\\\to 0} \\\\frac{f(x+h) - f(x)}{h}

CRITICAL EQUATION RULES:
- NEVER use $ or $$ delimiters - just provide the LaTeX content
- ALWAYS match opening { with closing }
- ALWAYS use braces {} for multi-character subscripts or superscripts
- ALL equations must be inline equations (type: "equation" in segments)
- For standalone equations, put them in a paragraph by themselves with align: "center"
- For equations within text, include them as segments alongside text
- NEVER use type: "equation" for blocks - use type: "paragraph" with equation segments
- Always escape backslashes in JSON (use \\\\ instead of \\)
- DOUBLE-CHECK your braces before responding!

TABLE SUPPORT:

You can insert tables to organize data in rows and columns.

Example - Simple 2x2 table:
{
  "operation": "insert_block",
  "afterBlockId": "block-3",
  "newBlock": {
    "id": "new-table-1",
    "type": "table",
    "segments": [],
    "tableData": {
      "rows": [
        {
          "cells": [
            { "segments": [{ "text": "Header 1", "format": 1 }] },
            { "segments": [{ "text": "Header 2", "format": 1 }] }
          ]
        },
        {
          "cells": [
            { "segments": [{ "text": "Cell A", "format": 0 }] },
            { "segments": [{ "text": "Cell B", "format": 0 }] }
          ]
        }
      ]
    }
  }
}

Table with equations:
{
  "operation": "insert_block",
  "afterBlockId": "block-1",
  "newBlock": {
    "id": "new-table-2",
    "type": "table",
    "segments": [],
    "tableData": {
      "rows": [
        {
          "cells": [
            { "segments": [{ "text": "Formula", "format": 1 }] },
            { "segments": [{ "text": "Result", "format": 1 }] }
          ]
        },
        {
          "cells": [
            { "segments": [{ "type": "equation", "equation": "E=mc^2" }] },
            { "segments": [{ "text": "Energy-mass equivalence", "format": 0 }] }
          ]
        }
      ]
    }
  }
}

CRITICAL TABLE RULES:
- Table blocks have type: "table"
- segments array must be EMPTY for table blocks (use segments: [])
- All content goes in tableData.rows
- Each row has a cells array
- Each cell has a segments array (text and/or equations)
- All rows must have the same number of cells
- Use format: 1 (bold) for header rows
- Tables support both text and equation segments in cells

FORMATTING STANDARDS:
${FORMATTING_STANDARDS}`;

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
                  type: { type: 'string', enum: ['paragraph', 'heading', 'list-item', 'table'] },
                  tag: { type: 'string', enum: ['h1', 'h2', 'h3'], description: 'Heading level (for headings only)' },
                  listType: { type: 'string', enum: ['bullet', 'number'], description: 'List type (for list-items only)' },
                  align: { type: 'string', enum: ['left', 'center', 'right', 'justify', 'start', 'end'], description: 'Text alignment (optional, defaults to left). Use "center" for standalone equations.' },
                  segments: {
                    type: 'array',
                    description: 'Text and equation segments. For standalone equations, use a single equation segment. For inline equations, mix with text segments.',
                    items: {
                      oneOf: [
                        {
                          type: 'object',
                          description: 'Text segment',
                          properties: {
                            text: { type: 'string' },
                            format: { type: 'integer', description: 'Format bitmask: 0=normal, 1=bold, 2=italic, 4=underline' },
                          },
                          required: ['text', 'format'],
                        },
                        {
                          type: 'object',
                          description: 'Inline equation segment',
                          properties: {
                            type: { type: 'string', enum: ['equation'] },
                            equation: { type: 'string', description: 'LaTeX equation (no $ delimiters)' },
                          },
                          required: ['type', 'equation'],
                        }
                      ]
                    },
                  },
                  tableData: {
                    type: 'object',
                    description: 'Table data (required for table blocks, omit for other types)',
                    properties: {
                      rows: {
                        type: 'array',
                        description: 'Array of table rows',
                        items: {
                          type: 'object',
                          properties: {
                            cells: {
                              type: 'array',
                              description: 'Array of cells in this row',
                              items: {
                                type: 'object',
                                properties: {
                                  segments: {
                                    type: 'array',
                                    description: 'Text and equation segments in the cell',
                                    items: {
                                      oneOf: [
                                        {
                                          type: 'object',
                                          description: 'Text segment',
                                          properties: {
                                            text: { type: 'string' },
                                            format: { type: 'integer' },
                                          },
                                          required: ['text', 'format'],
                                        },
                                        {
                                          type: 'object',
                                          description: 'Inline equation segment',
                                          properties: {
                                            type: { type: 'string', enum: ['equation'] },
                                            equation: { type: 'string' },
                                          },
                                          required: ['type', 'equation'],
                                        }
                                      ]
                                    },
                                  },
                                },
                                required: ['segments'],
                              },
                            },
                          },
                          required: ['cells'],
                        },
                      },
                    },
                    required: ['rows'],
                  },
                },
                required: ['id', 'type', 'segments'],
              },
              newSegments: {
                type: 'array',
                description: 'New text and equation segments (for modify_segments only)',
                items: {
                  oneOf: [
                    {
                      type: 'object',
                      description: 'Text segment',
                      properties: {
                        text: { type: 'string' },
                        format: { type: 'integer' },
                      },
                      required: ['text', 'format'],
                    },
                    {
                      type: 'object',
                      description: 'Inline equation segment',
                      properties: {
                        type: { type: 'string', enum: ['equation'] },
                        equation: { type: 'string' },
                      },
                      required: ['type', 'equation'],
                    }
                  ]
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

interface EquationSegment {
  type: 'equation';
  equation: string;
}

type Segment = TextSegment | EquationSegment;

interface EquationBlockData {
  equation: string;
  inline: boolean;
}

interface TableCell {
  segments: Segment[];
}

interface TableRow {
  cells: TableCell[];
}

interface TableBlockData {
  rows: TableRow[];
}

interface SimplifiedBlock {
  id: string;
  type: 'paragraph' | 'heading' | 'list-item' | 'table';
  tag?: 'h1' | 'h2' | 'h3';
  listType?: 'bullet' | 'number';
  indent?: number;
  align?: 'left' | 'center' | 'right' | 'justify' | 'start' | 'end';
  segments: Segment[];
  equationData?: EquationBlockData;  // Legacy - no longer used
  tableData?: TableBlockData;  // For table blocks
}

interface SimplifiedDocument {
  blocks: SimplifiedBlock[];
}

interface CommandRequest {
  document: SimplifiedDocument;
  instruction: string;
  conversation_history?: Array<{ role: string; content: string }>;
  context_snippets?: string[];
  stream?: boolean;
}

interface CommandResponse {
  type: string;
  reasoning?: string;
  changes?: any[];
  summary: string;
}

// ============== Streaming Helper Functions ==============

async function processOpenAIStream(
  openaiStream: ReadableStream<Uint8Array>,
  writer: WritableStreamDefaultWriter,
  messages: ChatMessage[],
  openaiConfig: any
) {
  const reader = openaiStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulatedToolCalls: any[] = [];
  let toolCallsMap = new Map<number, any>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        if (line.includes('[DONE]')) continue;

        try {
          const jsonStr = line.slice(6);
          const chunk: ChatCompletionChunk = JSON.parse(jsonStr);
          const delta = chunk.choices[0]?.delta;

          // Handle content tokens
          if (delta?.content) {
            const event = {
              type: 'token',
              content: delta.content,
            };
            await writer.write(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
          }

          // Accumulate tool calls
          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index;

              if (!toolCallsMap.has(index)) {
                toolCallsMap.set(index, {
                  id: toolCallDelta.id || '',
                  type: toolCallDelta.type || 'function',
                  function: {
                    name: toolCallDelta.function?.name || '',
                    arguments: toolCallDelta.function?.arguments || '',
                  },
                });
              } else {
                const existing = toolCallsMap.get(index);
                if (toolCallDelta.id) existing.id = toolCallDelta.id;
                if (toolCallDelta.type) existing.type = toolCallDelta.type;
                if (toolCallDelta.function?.name) {
                  existing.function.name = toolCallDelta.function.name;
                }
                if (toolCallDelta.function?.arguments) {
                  existing.function.arguments += toolCallDelta.function.arguments;
                }
              }
            }
          }

          // Check for finish
          if (chunk.choices[0]?.finish_reason) {
            console.log('[ai-command] Stream finished with reason:', chunk.choices[0].finish_reason);
          }
        } catch (parseError) {
          console.error('[ai-command] Error parsing SSE line:', parseError);
        }
      }
    }

    // Convert tool calls map to array
    accumulatedToolCalls = Array.from(toolCallsMap.values());

    // Extract changes from tool calls
    const changes: any[] = [];
    for (const toolCall of accumulatedToolCalls) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        if (toolCall.function.name === 'edit_document') {
          changes.push(...(args.changes || []));
        }
      } catch (error) {
        console.error('[ai-command] Error parsing tool call arguments:', error);
      }
    }

    // Emit changes
    if (changes.length > 0) {
      const event = {
        type: 'changes',
        changes,
      };
      await writer.write(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      console.log('[ai-command] Emitted', changes.length, 'changes');
    }

    // Get summary only (reasoning was already provided upfront)
    if (accumulatedToolCalls.length > 0) {
      console.log('[ai-command] Getting summary with streaming...');

      // Build messages for summary request
      const summaryMessages = [...messages];
      summaryMessages.push({
        role: 'assistant',
        content: '',
        tool_calls: accumulatedToolCalls,
      });

      for (const toolCall of accumulatedToolCalls) {
        summaryMessages.push({
          role: 'tool',
          content: 'Applied successfully',
          tool_call_id: toolCall.id,
        });
      }

      summaryMessages.push({
        role: 'user',
        content: 'Now provide a brief summary of what was done in JSON format with field: summary',
      });

      // Stream the summary response
      const summaryStream = await createChatCompletionStream(openaiConfig, {
        model: 'gpt-5-mini',
        messages: summaryMessages,
        max_completion_tokens: 300,
        reasoning_effort: 'minimal',
        response_format: { type: 'json_object' },
      });

      const summaryReader = summaryStream.getReader();
      const summaryDecoder = new TextDecoder();
      let summaryBuffer = '';
      let summaryContent = '';

      while (true) {
        const { done, value } = await summaryReader.read();
        if (done) break;

        summaryBuffer += summaryDecoder.decode(value, { stream: true });
        const lines = summaryBuffer.split('\n');
        summaryBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          if (line.includes('[DONE]')) continue;

          try {
            const jsonStr = line.slice(6);
            const chunk: ChatCompletionChunk = JSON.parse(jsonStr);
            const delta = chunk.choices[0]?.delta;

            if (delta?.content) {
              summaryContent += delta.content;
              // Don't emit summary tokens as they're JSON - we'll send the parsed summary instead
            }
          } catch (parseError) {
            console.error('[ai-command] Error parsing summary SSE:', parseError);
          }
        }
      }

      // Parse the accumulated JSON response
      try {
        const result = JSON.parse(summaryContent || '{}');
        const summary = result.summary || 'Changes applied.';

        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'summary', summary })}\n\n`));
      } catch (parseError) {
        console.error('[ai-command] Error parsing summary JSON:', parseError);
        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'summary', summary: 'Changes applied.' })}\n\n`));
      }
    }

    // Emit complete
    await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'complete' })}\n\n`));
    console.log('[ai-command] Stream processing complete');
  } catch (error) {
    console.error('[ai-command] Error in stream processing:', error);
    const errorEvent = {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    await writer.write(new TextEncoder().encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
  } finally {
    try {
      await writer.close();
    } catch (e) {
      console.error('[ai-command] Error closing writer:', e);
    }
  }
}

async function handleStreamingRequest(
  messages: ChatMessage[],
  openaiConfig: any
): Promise<Response> {
  console.log('[ai-command] Handling streaming request');

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Start stream processing in background
  (async () => {
    try {
      const openaiStream = await createChatCompletionStream(openaiConfig, {
        model: 'gpt-5-mini',
        messages,
        tools: [EDIT_DOCUMENT_TOOL],
        tool_choice: 'auto',
        max_completion_tokens: 128000,
        reasoning_effort: 'low',
      });

      await processOpenAIStream(openaiStream, writer, messages, openaiConfig);
    } catch (error) {
      console.error('[ai-command] Error in streaming handler:', error);
      const errorEvent = {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      try {
        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        await writer.close();
      } catch (e) {
        console.error('[ai-command] Error writing error event:', e);
      }
    }
  })();

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function handleNonStreamingRequest(
  messages: ChatMessage[],
  openaiConfig: any
): Promise<Response> {
  console.log('[ai-command] Handling non-streaming request');

  // Make OpenAI API call
  const response = await createChatCompletion(openaiConfig, {
    model: 'gpt-5-mini',
    messages,
    tools: [EDIT_DOCUMENT_TOOL],
    tool_choice: 'auto',
    max_completion_tokens: 128000,
    reasoning_effort: 'low',
  });

  const message = response.choices[0].message;
  const finishReason = response.choices[0].finish_reason;
  const toolCalls = message.tool_calls || [];

  console.log('[ai-command] Finish reason:', finishReason);
  console.log('[ai-command] Tool calls received:', toolCalls.length);

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

  // Get summary only (reasoning was already provided upfront)
  let reasoning = '';
  let summary = '';

  if (toolCalls.length > 0) {
    console.log('[ai-command] Processing tool calls for summary...');
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

    messages.push({
      role: 'user',
      content: 'Now provide a brief summary of what was done in JSON format with field: summary',
    });

    console.log('[ai-command] Requesting final summary from OpenAI...');
    const finalResponse = await createChatCompletion(openaiConfig, {
      model: 'gpt-5-mini',
      messages,
      max_completion_tokens: 300,
      reasoning_effort: 'minimal',
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(finalResponse.choices[0].message.content || '{}');
    summary = result.summary || 'Changes applied.';
    // Reasoning is captured from the initial response content
    reasoning = message.content || '';
    console.log('[ai-command] Reasoning (from initial response):', reasoning?.substring(0, 100));
    console.log('[ai-command] Summary:', summary?.substring(0, 100));
  } else {
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

  return new Response(JSON.stringify(responseData), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
    const { document, instruction, conversation_history, context_snippets, stream = false } = requestData;

    console.log('[ai-command] Request data received:');
    console.log('  - Document blocks:', document?.blocks?.length || 0);
    console.log('  - Instruction:', instruction?.substring(0, 100) || 'MISSING');
    console.log('  - Conversation history length:', conversation_history?.length || 0);
    console.log('  - Context snippets:', context_snippets?.length || 0);
    console.log('  - Stream mode:', stream);

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
      document.blocks[0].type === 'paragraph' &&
      document.blocks[0].segments.every(s => 'text' in s && s.text.trim() === '')
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

    // Branch based on streaming mode
    if (stream) {
      console.log('[ai-command] Using streaming mode');
      return await handleStreamingRequest(messages, openaiConfig);
    } else {
      console.log('[ai-command] Using non-streaming mode');
      const response = await handleNonStreamingRequest(messages, openaiConfig);
      console.log('[ai-command] ✅ Request completed successfully');
      console.log('=== AI Command Function Completed ===');
      return response;
    }

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
