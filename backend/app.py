from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import openai
import os
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

class FormatRequest(BaseModel):
    content: str
    format_type: str = "APA"

class WriteRequest(BaseModel):
    prompt: str
    context: Optional[str] = None

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/api/format")
async def format_document(request: FormatRequest):
    try:
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        prompt = f"""
        Format the following document according to {request.format_type} standards:
        
        Content:
        {request.content}
        
        Please return the formatted content with proper:
        - Headings and structure
        - Citations (if applicable)
        - Spacing and margins
        - Font formatting instructions
        
        Return only the formatted content without explanations.
        """
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.1
        )
        
        return {
            "formatted_content": response.choices[0].message.content,
            "format_type": request.format_type
        }
    except Exception as e:
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

@app.post("/api/command")
async def process_ai_command(request: DocumentRequest):
    try:
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        # Build messages array with conversation history
        messages = []
        
        # Add system message
        messages.append({
            "role": "system",
            "content": """You are an AI writing assistant. When the user asks you to modify their document:
1. Apply the requested changes to the document content
2. Return a JSON response with two fields:
   - "summary": A brief, friendly summary of what changes you made (2-3 sentences max)
   - "processed_content": The full modified document content
3. If the user provides explicit context snippets, treat them as the highest-priority guidance and make sure your edits respect them.

Always respond in valid JSON format with these two fields."""
        })
        
        # Add conversation history if provided
        if request.conversation_history:
            messages.extend(request.conversation_history)
        
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

Please apply the requested changes and return a JSON response with:
1. "summary": A brief description of what you changed
2. "processed_content": The modified document"""
        })
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=2000,
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        # Parse the JSON response
        import json
        result = json.loads(response.choices[0].message.content)
        
        return {
            "summary": result.get("summary", "Changes applied successfully."),
            "processed_content": result.get("processed_content", request.content)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Command processing error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)