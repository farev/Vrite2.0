import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth, checkRateLimit } from '../_shared/auth.ts';
import { getOpenAIClient, createChatCompletion, type ChatMessage, type Tool } from '../_shared/openai.ts';

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

Use replace_text tool with proper markdown syntax.`;

const FORMATTING_STANDARDS = `
APA 7th: Title page (bold title), running head, Level 1-2 headings (centered/left bold), double-space, 0.5" indent
MLA 9th: Header (last name + page), first page heading, centered title, double-space, 0.5" indent
Chicago 17th: Title page (title 1/3 down), footnotes/endnotes, bibliography hanging indent
IEEE: Section numbering, column format, citation brackets`;

const FORMAT_INSTRUCTIONS: Record<string, string> = {
  APA: `Apply APA 7th Edition formatting using MARKDOWN:
- Title: Use **Title** for bold title (Title Case)
- Headings: ## Level 1 Heading (Bold Title Case), ### Level 2 Heading
- References: Use "## References" for the heading
- Emphasis: Use **bold** for emphasis

Examples:
- Title: replace_text("my document title", "**My Document Title**")
- Section heading: replace_text("EDUCATION", "## Education")
- Bold text: replace_text("Bachelor of Science", "**Bachelor of Science**")

Use replace_text tool with proper markdown syntax.`,
  
  MLA: `Apply MLA 9th Edition formatting using MARKDOWN:
- Title: Use # Title (standard capitalization, not bold)
- Works Cited: Use "# Works Cited" for the heading
- No bold/italic in title
- Book titles in text: Use *italic* for book titles

Examples:
- Title: replace_text("the great gatsby", "# The Great Gatsby")
- Works Cited heading: replace_text("works cited", "# Works Cited")
- Book title in text: replace_text("The Great Gatsby", "*The Great Gatsby*")

Use replace_text tool with proper markdown syntax.`,
  
  Chicago: `Apply Chicago 17th Edition formatting using MARKDOWN:
- Title: Use # Title for title page
- Bibliography: Use "# Bibliography" for the heading
- Book titles in text: Use *italic* for book titles
- Emphasis: Use *italic* for foreign phrases

Examples:
- Title: replace_text("my thesis", "# My Thesis")
- Bibliography heading: replace_text("bibliography", "# Bibliography")
- Book title in text: replace_text("The Great Gatsby", "*The Great Gatsby*")

Use replace_text tool with proper markdown syntax.`,
};

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

interface FormatRequest {
  content: string;
  format_type: string;
}

interface DeltaChange {
  old_text: string;
  new_text: string;
}

interface FormatResponse {
  type: string;
  reasoning?: string;
  changes?: DeltaChange[];
  summary: string;
  format_type: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const { user, supabase } = await verifyAuth(req);
    
    const isAllowed = await checkRateLimit(user.id, 'format-document', supabase, 10, 60);
    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    const { content, format_type }: FormatRequest = await req.json();
    
    if (!content || !format_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    const openaiConfig = await getOpenAIClient();
    
    const instruction = FORMAT_INSTRUCTIONS[format_type] || 
      `Apply ${format_type} formatting standards`;
    
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: EDITOR_SYSTEM_PROMPT + '\n\n' + FORMATTING_STANDARDS,
      },
      {
        role: 'user',
        content: `Document content:\n${content}\n\n${instruction}\n\nUse the replace_text tool to make formatting changes, then provide reasoning and summary.`,
      },
    ];
    
    const response = await createChatCompletion(openaiConfig, {
      model: 'gpt-4o-mini',
      messages,
      tools: [REPLACE_TEXT_TOOL],
      tool_choice: 'auto',
      max_tokens: 2000,
      temperature: 0.1,
    });
    
    const message = response.choices[0].message;
    const toolCalls = message.tool_calls || [];
    
    const changes: DeltaChange[] = [];
    for (const toolCall of toolCalls) {
      if (toolCall.function.name === 'replace_text') {
        const args = JSON.parse(toolCall.function.arguments);
        changes.push({
          old_text: args.old_text || '',
          new_text: args.new_text || '',
        });
      }
    }
    
    let reasoning = '';
    let summary = '';
    
    if (toolCalls.length > 0) {
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
      
      messages.push({
        role: 'user',
        content: 'Now provide your reasoning and summary in JSON format with fields: reasoning, summary',
      });
      
      const finalResponse = await createChatCompletion(openaiConfig, {
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 500,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });
      
      const result = JSON.parse(finalResponse.choices[0].message.content || '{}');
      reasoning = result.reasoning || '';
      summary = result.summary || 'Formatting applied.';
    }
    
    const responseData: FormatResponse = {
      type: 'tool_based',
      reasoning,
      changes,
      summary,
      format_type,
    };
    
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Format error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
