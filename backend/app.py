from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import openai
import os

app = FastAPI(title="Vrite AI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DocumentRequest(BaseModel):
    content: str
    instruction: str

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
        
        prompt = f"""
        Document content:
        {request.content}
        
        User instruction: {request.instruction}
        
        Please apply the requested changes to the document and return the modified content.
        """
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.3
        )
        
        return {
            "processed_content": response.choices[0].message.content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Command processing error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)