from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Literal, Union
import openai
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Vrite AI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DocumentRequest(BaseModel):
    content: str
    instruction: str
    conversation_history: Optional[list] = None
    context_snippets: Optional[List[str]] = None

class DeltaChange(BaseModel):
    operation: str  # "insert" | "delete" | "replace"
    position: int
    old_text: Optional[str] = None
    new_text: Optional[str] = None
    context_before: Optional[str] = None
    context_after: Optional[str] = None

class DeltaResponse(BaseModel):
    type: str  # "delta" | "full"
    reasoning: Optional[str] = None
    changes: Optional[List[DeltaChange]] = None
    summary: str
    processed_content: Optional[str] = None

class FormatRequest(BaseModel):
    content: str
    format_type: str = "APA"

class WriteRequest(BaseModel):
    prompt: str
    context: Optional[str] = None

# ============== Lexical JSON Models (V2 API) ==============

class TextSegment(BaseModel):
    text: str
    format: int = 0  # Bitmask: 0=normal, 1=bold, 2=italic, 4=underline, etc.

class SimplifiedBlock(BaseModel):
    id: str
    type: Literal['paragraph', 'heading', 'list-item']
    tag: Optional[Literal['h1', 'h2', 'h3']] = None
    listType: Optional[Literal['bullet', 'number']] = None
    indent: Optional[int] = None
    segments: List[TextSegment]

class SimplifiedDocument(BaseModel):
    blocks: List[SimplifiedBlock]

class LexicalDocumentRequest(BaseModel):
    document: SimplifiedDocument
    instruction: str
    conversation_history: Optional[list] = None
    context_snippets: Optional[List[str]] = None

# ============== System prompts for AI agent ==============
EDITOR_SYSTEM_PROMPT = """You are a professional document editing agent. Your role is to apply precise edits to documents efficiently.

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
- "summary": Concise statement of what was changed (no pleasantries)
"""

FORMATTING_STANDARDS = """
APA 7th: Title page (bold title), running head, Level 1-2 headings (centered/left bold), double-space, 0.5" indent
MLA 9th: Header (last name + page), first page heading, centered title, double-space, 0.5" indent
Chicago 17th: Title page (title 1/3 down), footnotes/endnotes, bibliography hanging indent
IEEE: Section numbering, column format, citation brackets
"""

# ============== V2 System Prompt (Lexical JSON) ==============

EDITOR_SYSTEM_PROMPT_V2 = """You are a professional document editing and writing assistant. You help users create, edit, and format documents with precision.

CRITICAL RULES:
1. NO conversational fluff (no "Certainly!", "I'd be happy to", etc.)
2. Documents are provided as simplified Lexical JSON with blocks and segments
3. Use the edit_document tool to make ALL changes
4. Be surgical and precise - change only what's necessary
5. Preserve existing formatting unless explicitly asked to change it
6. For BLANK documents or NEW CONTENT, use insert_block for EACH paragraph/heading/list-item
7. NEVER use markdown syntax like ** or * in text - use format bitmask instead
8. NEVER put multiple paragraphs in one block - each paragraph must be its own block
9. One block = one paragraph OR one heading OR one list item

DOCUMENT FORMAT:
Documents have this structure:
{
  "blocks": [
    {
      "id": "block-0",
      "type": "paragraph",
      "segments": [
        { "text": "Hello ", "format": 0 },
        { "text": "world", "format": 1 }
      ]
    }
  ]
}

Block types: "paragraph", "heading", "list-item"
For headings, include "tag": "h1", "h2", or "h3"
For list items, include "listType": "bullet" or "number"

FORMAT BITMASK VALUES:
- 0 = normal text
- 1 = bold
- 2 = italic
- 3 = bold + italic
- 4 = underline
- 5 = bold + underline
- 6 = italic + underline
- 7 = bold + italic + underline

HOW TO USE edit_document TOOL:

1. MODIFY TEXT within a block (keep same structure, change content):
   Use "modify_segments" with blockId and new segments

2. CHANGE BLOCK TYPE (e.g., paragraph to heading):
   Use "replace_block" with blockId and complete newBlock

3. ADD NEW CONTENT (including to blank documents):
   Use "insert_block" with afterBlockId (null for start) and newBlock

4. DELETE CONTENT:
   Use "delete_block" with blockId

EXAMPLES:

Making text bold in block-0:
{"operation": "modify_segments", "blockId": "block-0", "newSegments": [{"text": "Hello ", "format": 0}, {"text": "world", "format": 1}]}

Converting paragraph to H2 heading:
{"operation": "replace_block", "blockId": "block-0", "newBlock": {"id": "block-0", "type": "heading", "tag": "h2", "segments": [{"text": "Introduction", "format": 1}]}}

Adding content to BLANK document:
{"operation": "insert_block", "afterBlockId": null, "newBlock": {"id": "new-1", "type": "heading", "tag": "h1", "segments": [{"text": "Document Title", "format": 1}]}}

Adding paragraph after existing block:
{"operation": "insert_block", "afterBlockId": "block-0", "newBlock": {"id": "new-2", "type": "paragraph", "segments": [{"text": "New paragraph content.", "format": 0}]}}

Creating a numbered list (DO NOT include numbers in text - the listType handles numbering):
{"operation": "insert_block", "afterBlockId": "block-0", "newBlock": {"id": "new-3", "type": "list-item", "listType": "number", "segments": [{"text": "First list item", "format": 0}]}}
{"operation": "insert_block", "afterBlockId": "new-3", "newBlock": {"id": "new-4", "type": "list-item", "listType": "number", "segments": [{"text": "Second list item", "format": 0}]}}

Creating a bullet list (DO NOT include "-" or "•" in text - the listType handles bullets):
{"operation": "insert_block", "afterBlockId": "block-0", "newBlock": {"id": "new-5", "type": "list-item", "listType": "bullet", "segments": [{"text": "Bullet point item", "format": 0}]}}

IMPORTANT FOR LISTS:
- Use type "list-item" with listType "bullet" or "number"
- NEVER include "1.", "2.", "-", "•" etc. in the text - the list type handles rendering
- Each list item is a separate insert_block operation
- Use "indent" field (0, 1, 2...) for nested list items

CRITICAL - Creating outlines or multi-section content:
When creating an outline or document with multiple sections, you MUST create SEPARATE blocks:

CORRECT approach for "Create an outline":
[
  {"operation": "insert_block", "afterBlockId": null, "newBlock": {"id": "new-1", "type": "heading", "tag": "h1", "segments": [{"text": "Project Title", "format": 1}]}},
  {"operation": "insert_block", "afterBlockId": "new-1", "newBlock": {"id": "new-2", "type": "heading", "tag": "h2", "segments": [{"text": "Introduction", "format": 1}]}},
  {"operation": "insert_block", "afterBlockId": "new-2", "newBlock": {"id": "new-3", "type": "list-item", "listType": "bullet", "segments": [{"text": "Brief overview", "format": 0}]}},
  {"operation": "insert_block", "afterBlockId": "new-3", "newBlock": {"id": "new-4", "type": "list-item", "listType": "bullet", "segments": [{"text": "Objectives", "format": 0}]}},
  {"operation": "insert_block", "afterBlockId": "new-4", "newBlock": {"id": "new-5", "type": "heading", "tag": "h2", "segments": [{"text": "Methodology", "format": 1}]}}
]

WRONG - Never do this:
{"operation": "modify_segments", "blockId": "block-0", "newSegments": [{"text": "1. Introduction\\n- Overview\\n2. Methods", "format": 0}]}

WRITING PRINCIPLES:
- For blank documents, CREATE useful content based on user's request
- When writing, generate well-structured, high-quality content
- Match the user's tone and style when editing existing content
- Use headings to organize longer content
- Make bold/italic formatting purposeful, not excessive

AFTER using tools, provide:
- "reasoning": Brief analysis of what changes were made and why (1-3 sentences)
- "summary": Concise statement of what was changed (no pleasantries)
"""

# ============== V2 Tool Definition ==============

EDIT_DOCUMENT_TOOL = {
    "type": "function",
    "function": {
        "name": "edit_document",
        "description": """Edit the document using block-level operations. Each block has an 'id' for reference.

Operations:
- replace_block: Replace entire block with new content/type
- insert_block: Insert new block (use afterBlockId=null for start of document)
- delete_block: Remove a block
- modify_segments: Change text/formatting within a block

Format bitmask: 0=normal, 1=bold, 2=italic, 3=bold+italic, 4=underline""",
        "parameters": {
            "type": "object",
            "properties": {
                "changes": {
                    "type": "array",
                    "description": "List of changes to apply to the document",
                    "items": {
                        "type": "object",
                        "properties": {
                            "operation": {
                                "type": "string",
                                "enum": ["replace_block", "insert_block", "delete_block", "modify_segments"],
                                "description": "The type of operation to perform"
                            },
                            "blockId": {
                                "type": "string",
                                "description": "ID of the block to modify (for replace/delete/modify operations)"
                            },
                            "afterBlockId": {
                                "type": ["string", "null"],
                                "description": "ID of block to insert after. Use null to insert at the beginning (for insert_block only)"
                            },
                            "newBlock": {
                                "type": "object",
                                "description": "The new block content (for replace_block and insert_block)",
                                "properties": {
                                    "id": {"type": "string", "description": "Unique ID for the block"},
                                    "type": {"type": "string", "enum": ["paragraph", "heading", "list-item"]},
                                    "tag": {"type": "string", "enum": ["h1", "h2", "h3"], "description": "Heading level (for headings only)"},
                                    "listType": {"type": "string", "enum": ["bullet", "number"], "description": "List type (for list-items only)"},
                                    "segments": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "text": {"type": "string"},
                                                "format": {"type": "integer", "description": "Format bitmask: 0=normal, 1=bold, 2=italic, 4=underline"}
                                            },
                                            "required": ["text", "format"]
                                        }
                                    }
                                },
                                "required": ["id", "type", "segments"]
                            },
                            "newSegments": {
                                "type": "array",
                                "description": "New text segments (for modify_segments only)",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "text": {"type": "string"},
                                        "format": {"type": "integer"}
                                    },
                                    "required": ["text", "format"]
                                }
                            }
                        },
                        "required": ["operation"]
                    }
                }
            },
            "required": ["changes"]
        }
    }
}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/api/format")
async def format_document(request: FormatRequest):
    try:
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        # Formatting-specific system prompts
        format_instructions = {
            "APA": """Apply APA 7th Edition formatting using MARKDOWN:
- Title: Use **Title** for bold title (Title Case)
- Headings: ## Level 1 Heading (Bold Title Case), ### Level 2 Heading
- References: Use "## References" for the heading
- Emphasis: Use **bold** for emphasis

Examples:
- Title: replace_text("my document title", "**My Document Title**")
- Section heading: replace_text("EDUCATION", "## Education")
- Bold text: replace_text("Bachelor of Science", "**Bachelor of Science**")

Use replace_text tool with proper markdown syntax.""",

            "MLA": """Apply MLA 9th Edition formatting using MARKDOWN:
- Title: Use # Title (standard capitalization, not bold)
- Works Cited: Use "# Works Cited" for the heading
- No bold/italic in title
- Book titles in text: Use *italic* for book titles

Examples:
- Title: replace_text("the great gatsby", "# The Great Gatsby")
- Works Cited heading: replace_text("works cited", "# Works Cited")
- Book title in text: replace_text("The Great Gatsby", "*The Great Gatsby*")

Use replace_text tool with proper markdown syntax.""",

            "Chicago": """Apply Chicago 17th Edition formatting using MARKDOWN:
- Title: Use # Title for title page
- Bibliography: Use "# Bibliography" for the heading
- Book titles in text: Use *italic* for book titles
- Emphasis: Use *italic* for foreign phrases

Examples:
- Title: replace_text("my thesis", "# My Thesis")
- Bibliography heading: replace_text("bibliography", "# Bibliography")
- Book title in text: replace_text("The Great Gatsby", "*The Great Gatsby*")

Use replace_text tool with proper markdown syntax."""
        }

        instruction = format_instructions.get(request.format_type, f"Apply {request.format_type} formatting standards")

        messages = [
            {"role": "system", "content": EDITOR_SYSTEM_PROMPT + "\n\n" + FORMATTING_STANDARDS},
            {"role": "user", "content": f"""Document content:
{request.content}

{instruction}

Use the replace_text tool to make formatting changes, then provide reasoning and summary."""}
        ]

        # Make API call with replace_text tool
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=[REPLACE_TEXT_TOOL],
            tool_choice="auto",
            max_tokens=2000,
            temperature=0.1
        )

        message = response.choices[0].message
        tool_calls = message.tool_calls if message.tool_calls else []

        # Convert tool calls to changes
        changes = []
        for tool_call in tool_calls:
            import json
            args = json.loads(tool_call.function.arguments)

            if tool_call.function.name == "replace_text":
                changes.append({
                    "old_text": args.get("old_text", ""),
                    "new_text": args.get("new_text", "")
                })

        # Get final response
        reasoning = ""
        summary = ""

        if tool_calls:
            messages.append(message.model_dump())
            for tool_call in tool_calls:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": "Applied successfully"
                })

            # Add final instruction to get JSON response
            messages.append({
                "role": "user",
                "content": "Now provide your reasoning and summary in JSON format with fields: reasoning, summary"
            })

            final_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=500,
                temperature=0.1,
                response_format={"type": "json_object"}
            )

            import json
            result = json.loads(final_response.choices[0].message.content)
            reasoning = result.get("reasoning", "")
            summary = result.get("summary", "Formatting applied.")

        return {
            "type": "tool_based",
            "reasoning": reasoning,
            "changes": changes,
            "summary": summary,
            "format_type": request.format_type
        }
    except Exception as e:
        import traceback
        print(f"Formatting error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Formatting error: {str(e)}")

@app.post("/api/enhance")
async def enhance_writing(request: WriteRequest):
    try:
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        context_text = f"Context: {request.context}\n\n" if request.context else ""
        
        prompt = f"""
        {context_text}Generate or enhance the following writing request:
        {request.prompt}
        
        Provide clear, well-structured content that flows naturally with any existing context.
        """
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1500,
            temperature=0.7
        )
        
        return {
            "enhanced_content": response.choices[0].message.content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Enhancement error: {str(e)}")

# Define tools for OpenAI function calling
REPLACE_TEXT_TOOL = {
    "type": "function",
    "function": {
        "name": "replace_text",
        "description": "Replace exact text in the document. Call this multiple times for multiple changes.",
        "parameters": {
            "type": "object",
            "properties": {
                "old_text": {
                    "type": "string",
                    "description": "The exact text to find and replace in the document"
                },
                "new_text": {
                    "type": "string",
                    "description": "The replacement text"
                }
            },
            "required": ["old_text", "new_text"]
        }
    }
}

APPLY_BOLD_TOOL = {
    "type": "function",
    "function": {
        "name": "apply_bold",
        "description": "Make text bold in the document. Use this instead of markdown **text**.",
        "parameters": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "The exact text to make bold"
                }
            },
            "required": ["text"]
        }
    }
}

APPLY_ITALIC_TOOL = {
    "type": "function",
    "function": {
        "name": "apply_italic",
        "description": "Make text italic in the document. Use this instead of markdown *text*.",
        "parameters": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "The exact text to make italic"
                }
            },
            "required": ["text"]
        }
    }
}

APPLY_HEADING_TOOL = {
    "type": "function",
    "function": {
        "name": "apply_heading",
        "description": "Convert text to a heading with the specified level (1, 2, or 3).",
        "parameters": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "The exact text to convert to a heading"
                },
                "level": {
                    "type": "integer",
                    "description": "Heading level: 1 (largest), 2 (medium), or 3 (smallest)",
                    "enum": [1, 2, 3]
                }
            },
            "required": ["text", "level"]
        }
    }
}

# All available tools
ALL_FORMATTING_TOOLS = [
    REPLACE_TEXT_TOOL,
    APPLY_BOLD_TOOL,
    APPLY_ITALIC_TOOL,
    APPLY_HEADING_TOOL
]

# Formatting standards knowledge for tools
FORMATTING_TOOLS = {
    "apa": {
        "type": "function",
        "function": {
            "name": "apply_apa_heading",
            "description": "Apply APA 7th Edition heading format. Level 1: Centered Bold Title Case. Level 2: Left Aligned Bold Title Case.",
            "parameters": {
                "type": "object",
                "properties": {
                    "old_heading": {"type": "string", "description": "Current heading text"},
                    "new_heading": {"type": "string", "description": "Heading with proper APA capitalization"},
                    "level": {"type": "integer", "description": "Heading level (1 or 2)"}
                },
                "required": ["old_heading", "new_heading", "level"]
            }
        }
    },
    "mla": {
        "type": "function",
        "function": {
            "name": "apply_mla_format",
            "description": "Apply MLA 9th Edition formatting. Title: centered, standard capitalization. First page: Name, Instructor, Course, Date (top left, double-spaced).",
            "parameters": {
                "type": "object",
                "properties": {
                    "old_text": {"type": "string"},
                    "new_text": {"type": "string"}
                },
                "required": ["old_text", "new_text"]
            }
        }
    },
    "chicago": {
        "type": "function",
        "function": {
            "name": "apply_chicago_format",
            "description": "Apply Chicago 17th Edition formatting. Title page: title centered 1/3 down, author and course info bottom third.",
            "parameters": {
                "type": "object",
                "properties": {
                    "old_text": {"type": "string"},
                    "new_text": {"type": "string"}
                },
                "required": ["old_text", "new_text"]
            }
        }
    }
}

@app.post("/api/command")
async def process_ai_command(request: DocumentRequest):
    try:
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        # Build messages array with conversation history
        messages = []

        # Add system message with new prompts
        messages.append({
            "role": "system",
            "content": EDITOR_SYSTEM_PROMPT + "\n\n" + FORMATTING_STANDARDS
        })

        # Add conversation history if provided (limit to last 7 exchanges)
        if request.conversation_history:
            recent_history = request.conversation_history[-14:]  # Last 7 exchanges (14 messages)
            messages.extend(recent_history)
        
        # Add current request
        context_text = ""
        if request.context_snippets:
            cleaned_context = [snippet.strip() for snippet in request.context_snippets if snippet.strip()]
            if cleaned_context:
                formatted_snippets = "\n".join(f"- {snippet}" for snippet in cleaned_context)
                context_text = f"""Priority context from the user:
{formatted_snippets}

"""

        messages.append({
            "role": "user",
            "content": f"""{context_text}Document content:
{request.content}

User instruction: {request.instruction}

Use the replace_text tool to make changes (remember to use markdown for formatting), then provide reasoning and summary."""
        })

        # Make API call with tools
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=[REPLACE_TEXT_TOOL],
            tool_choice="auto",
            max_tokens=2000,
            temperature=0.3
        )

        message = response.choices[0].message

        # Extract tool calls
        tool_calls = message.tool_calls if message.tool_calls else []

        # Convert tool calls to our change format
        changes = []
        for tool_call in tool_calls:
            import json
            args = json.loads(tool_call.function.arguments)

            if tool_call.function.name == "replace_text":
                changes.append({
                    "old_text": args.get("old_text", ""),
                    "new_text": args.get("new_text", "")
                })

        # If we have tool calls, we need to get the final response
        reasoning = ""
        summary = ""

        if tool_calls:
            # Add tool responses and get final summary
            messages.append(message.model_dump())

            # Add tool responses (all successful)
            for tool_call in tool_calls:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": "Applied successfully"
                })

            # Get final response with reasoning and summary
            # Add final instruction to get JSON response
            messages.append({
                "role": "user",
                "content": "Now provide your reasoning and summary in JSON format with fields: reasoning, summary"
            })

            final_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=500,
                temperature=0.3,
                response_format={"type": "json_object"}
            )

            import json
            result = json.loads(final_response.choices[0].message.content)
            reasoning = result.get("reasoning", "")
            summary = result.get("summary", "Changes applied.")
        else:
            # No tool calls - fallback to direct JSON response
            summary = message.content if message.content else "Changes applied."

        # Return changes
        if changes:
            return {
                "type": "tool_based",
                "reasoning": reasoning,
                "changes": changes,
                "summary": summary
            }
        else:
            # Fallback - no tools used
            return {
                "type": "full",
                "summary": summary,
                "processed_content": request.content,
                "reasoning": reasoning
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Command processing error: {str(e)}")

# ============== V2 API Endpoint (Lexical JSON) ==============

@app.post("/api/command/v2")
async def process_ai_command_v2(request: LexicalDocumentRequest):
    """
    Process AI commands using Lexical JSON format.
    Supports blank documents and structured block-level operations.
    """
    try:
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        messages = []
        messages.append({
            "role": "system",
            "content": EDITOR_SYSTEM_PROMPT_V2
        })

        # Add conversation history if provided (limit to last 7 exchanges)
        if request.conversation_history:
            recent_history = request.conversation_history[-14:]
            messages.extend(recent_history)

        # Build document JSON representation
        doc_dict = request.document.model_dump()
        doc_json = json.dumps(doc_dict, indent=2)

        # Build context text from snippets
        context_text = ""
        if request.context_snippets:
            cleaned_context = [snippet.strip() for snippet in request.context_snippets if snippet.strip()]
            if cleaned_context:
                formatted_snippets = "\n".join(f"- {snippet}" for snippet in cleaned_context)
                context_text = f"""Priority context from the user:
{formatted_snippets}

"""

        # Check if document is blank or nearly blank
        is_blank = len(request.document.blocks) == 0 or (
            len(request.document.blocks) == 1 and
            all(s.text.strip() == '' for s in request.document.blocks[0].segments)
        )
        blank_note = "\n\nIMPORTANT: The document is BLANK. You MUST use multiple insert_block operations (one per paragraph/heading/list-item). Do NOT use modify_segments. Create each piece of content as a separate block with its own insert_block operation." if is_blank else ""

        messages.append({
            "role": "user",
            "content": f"""{context_text}Document (Lexical JSON):
{doc_json}
{blank_note}

User instruction: {request.instruction}

Use the edit_document tool to make changes, then provide reasoning and summary."""
        })

        # DEBUG: Log input sizes
        total_chars = sum(len(m.get('content', '')) for m in messages)
        print(f"DEBUG: Total input chars: {total_chars}, Doc JSON chars: {len(doc_json)}")
        print(f"DEBUG: System prompt chars: {len(EDITOR_SYSTEM_PROMPT_V2)}")

        # Make API call with the edit_document tool
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=[EDIT_DOCUMENT_TOOL],
            tool_choice="auto",
            max_tokens=16384,
            temperature=0.3
        )

        message = response.choices[0].message
        finish_reason = response.choices[0].finish_reason

        # DEBUG: Log token usage
        print(f"DEBUG: Usage: {response.usage}")
        print(f"DEBUG: finish_reason: {finish_reason}")
        if message.tool_calls:
            for tc in message.tool_calls:
                print(f"DEBUG: Tool call args length: {len(tc.function.arguments)} chars")

        # Check if response was truncated
        if finish_reason == "length":
            raise ValueError("Response was truncated due to length. Try a simpler request.")

        tool_calls = message.tool_calls if message.tool_calls else []

        # Extract changes from tool calls
        changes = []
        for tool_call in tool_calls:
            try:
                args = json.loads(tool_call.function.arguments)
                if tool_call.function.name == "edit_document":
                    changes.extend(args.get("changes", []))
            except json.JSONDecodeError as e:
                print(f"JSON parse error: {e}")
                print(f"Raw arguments (first 500 chars): {tool_call.function.arguments[:500]}")
                print(f"Raw arguments (last 500 chars): {tool_call.function.arguments[-500:]}")
                raise ValueError(f"Model returned malformed JSON. Try a simpler request or break it into smaller steps.")

        # Get reasoning and summary
        reasoning = ""
        summary = ""

        if tool_calls:
            messages.append(message.model_dump())
            for tool_call in tool_calls:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": "Applied successfully"
                })

            messages.append({
                "role": "user",
                "content": "Now provide your reasoning and summary in JSON format with fields: reasoning, summary"
            })

            final_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=500,
                temperature=0.3,
                response_format={"type": "json_object"}
            )

            result = json.loads(final_response.choices[0].message.content)
            reasoning = result.get("reasoning", "")
            summary = result.get("summary", "Changes applied.")
        else:
            summary = message.content if message.content else "No changes needed."

        # Return response
        if changes:
            return {
                "type": "lexical_changes",
                "reasoning": reasoning,
                "changes": changes,
                "summary": summary
            }
        else:
            return {
                "type": "no_changes",
                "summary": summary,
                "reasoning": reasoning
            }

    except Exception as e:
        import traceback
        print(f"Command V2 error: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Command processing error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)