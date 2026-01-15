import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, checkRateLimit } from '../_shared/auth.ts';
import { getOpenAIClient, createChatCompletion, type ChatMessage, type Tool } from '../_shared/openai.ts';

// System prompt for the AI agent (ported from backend/app.py)
const EDITOR_SYSTEM_PROMPT = `You are a professional document editing agent. Your role is to apply precise edits to documents efficiently.

CRITICAL RULES:
1. NO conversational fluff (no "Certainly!", "I'd be happy to", etc.)
2. Documents are provided in MARKDOWN format
3. Use the replace_text tool to make changes
4. ALWAYS use markdown syntax for formatting: **bold**, *italic*, # headings
5. Be surgical and precise - change only what's necessary

MARKDOWN FORMAT:
The document uses markdown formatting:
- **bold text** for bold
- *italic text* for italic
- # Heading 1, ## Heading 2, ### Heading 3 for headings
- Blank lines separate paragraphs

HOW TO USE replace_text TOOL:
- Find the EXACT text that needs to be changed (old_text including markdown syntax)
- Specify what it should be replaced with (new_text with proper markdown)
- The tool will find and replace the text automatically
- You can call the tool multiple times for multiple changes

EXAMPLES:
- To make "Education" bold: replace_text("Education", "**Education**")
- To change "WORK EXPERIENCE" to bold heading: replace_text("WORK EXPERIENCE", "## Work Experience")
- To italicize a book title: replace_text("The Great Gatsby", "*The Great Gatsby*")
- To fix capitalization AND make bold: replace_text("education", "**Education**")

EDITING PRINCIPLES:
- Preserve the author's voice and style
- Make minimal necessary changes
- Maintain existing markdown formatting unless explicitly asked to change
- Preserve paragraph breaks (double newlines)

AFTER using tools, provide:
- "reasoning": Brief analysis of what changes were made and why (1-3 sentences)
- "summary": Concise statement of what was changed (no pleasantries)`;

const FORMATTING_STANDARDS = `
APA 7th: Title page (bold title), running head, Level 1-2 headings (centered/left bold), double-space, 0.5" indent
MLA 9th: Header (last name + page), first page heading, centered title, double-space, 0.5" indent
Chicago 17th: Title page (title 1/3 down), footnotes/endnotes, bibliography hanging indent
IEEE: Section numbering, column format, citation brackets`;

// Tool definition for replace_text
const REPLACE_TEXT_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'replace_text',
    description: 'Replace exact text in the document. Call this multiple times for multiple changes.',
    parameters: {
      type: 'object',
      properties: {
        old_text: {
          type: 'string',
          description: 'The exact text to find and replace in the document',
        },
        new_text: {
          type: 'string',
          description: 'The replacement text',
        },
      },
      required: ['old_text', 'new_text'],
    },
  },
};

interface CommandRequest {
  content: string;
  instruction: string;
  conversation_history?: Array<{ role: string; content: string }>;
  context_snippets?: string[];
}

interface DeltaChange {
  old_text: string;
  new_text: string;
}

interface CommandResponse {
  type: string;
  reasoning?: string;
  changes?: DeltaChange[];
  summary: string;
  processed_content?: string;
}

Deno.serve(async (req) => {
  console.log('=== AI Command Function Started ===');
  console.log('[ai-command] Request method:', req.method);
  console.log('[ai-command] Request URL:', req.url);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('[ai-command] Handling CORS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const allowAnonymous = Deno.env.get('ALLOW_ANON') === 'true';
    const authHeader = req.headers.get('Authorization');

    if (allowAnonymous && !authHeader) {
      console.warn('[ai-command] ⚠️ ALLOW_ANON enabled - skipping auth and rate limit');
    } else {
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
    }
    
    // Parse request body
    console.log('[ai-command] Parsing request body...');
    const requestData: CommandRequest = await req.json();
    const { content, instruction, conversation_history, context_snippets } = requestData;
    
    console.log('[ai-command] Request data received:');
    console.log('  - Content length:', content?.length || 0, 'characters');
    console.log('  - Instruction:', instruction?.substring(0, 100) || 'MISSING');
    console.log('  - Conversation history length:', conversation_history?.length || 0);
    console.log('  - Context snippets:', context_snippets?.length || 0);
    
    if (!content || !instruction) {
      console.error('[ai-command] ❌ Missing required fields - content:', !!content, 'instruction:', !!instruction);
      return new Response(
        JSON.stringify({ error: 'Missing required fields: content and instruction' }),
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
      content: EDITOR_SYSTEM_PROMPT + '\n\n' + FORMATTING_STANDARDS,
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
    
    // Add current request with context
    let contextText = '';
    if (context_snippets && context_snippets.length > 0) {
      const cleanedSnippets = context_snippets.filter(s => s.trim());
      if (cleanedSnippets.length > 0) {
        const formattedSnippets = cleanedSnippets.map(s => `- ${s}`).join('\n');
        contextText = `Priority context from the user:\n${formattedSnippets}\n\n`;
        console.log('[ai-command] Added', cleanedSnippets.length, 'context snippets');
      }
    }
    
    messages.push({
      role: 'user',
      content: `${contextText}Document content:\n${content}\n\nUser instruction: ${instruction}\n\nUse the replace_text tool to make changes (remember to use markdown for formatting), then provide reasoning and summary.`,
    });
    console.log('[ai-command] Total messages prepared:', messages.length);
    
    // Make OpenAI API call
    console.log('[ai-command] Making OpenAI API call with model: gpt-4o-mini');
    const response = await createChatCompletion(openaiConfig, {
      model: 'gpt-4o-mini',
      messages,
      tools: [REPLACE_TEXT_TOOL],
      tool_choice: 'auto',
      max_tokens: 2000,
      temperature: 0.3,
    });
    console.log('[ai-command] ✅ OpenAI API call completed successfully');
    
    const message = response.choices[0].message;
    const toolCalls = message.tool_calls || [];
    console.log('[ai-command] Tool calls received:', toolCalls.length);
    
    // Convert tool calls to changes
    const changes: DeltaChange[] = [];
    for (const toolCall of toolCalls) {
      if (toolCall.function.name === 'replace_text') {
        const args = JSON.parse(toolCall.function.arguments);
        changes.push({
          old_text: args.old_text || '',
          new_text: args.new_text || '',
        });
        console.log('[ai-command] Tool call:', toolCall.function.name, '- old_text length:', args.old_text?.length, 'new_text length:', args.new_text?.length);
      }
    }
    console.log('[ai-command] Total changes extracted:', changes.length);
    
    // Get final response with reasoning and summary
    let reasoning = '';
    let summary = '';
    
    if (toolCalls.length > 0) {
      console.log('[ai-command] Processing tool calls for reasoning and summary...');
      // Add tool call and responses to messages
      messages.push({
        role: 'assistant',
        content: message.content || '',
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
        temperature: 0.1,
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
      summary = message.content || 'Changes applied.';
      console.log('[ai-command] Fallback summary:', summary?.substring(0, 100));
    }
    
    // Return response
    const responseData: CommandResponse = changes.length > 0
      ? {
          type: 'tool_based',
          reasoning,
          changes,
          summary,
        }
      : {
          type: 'full',
          summary,
          processed_content: content,
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
    console.error('[ai-command] ❌ Full error object:', JSON.stringify(error, null, 2));
    
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
