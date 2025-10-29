# Vrite - AI-Powered Document Editor

A modern document editor with built-in AI assistance, similar to Cursor but for word processing. Built with Next.js, Lexical, and FastAPI.

## Features

- **Rich Text Editing**: Powered by Facebook's Lexical editor
- **AI Document Formatting**: Automatically format documents according to standards (APA, MLA, etc.)
- **Inline AI Assistance**: Generate and enhance writing directly in the editor
- **Command Interface**: Cursor-style Cmd/Ctrl+K for AI commands
- **Real-time Processing**: Instant AI feedback and suggestions

## Tech Stack

### Frontend
- **Next.js 14** with TypeScript
- **Lexical** for rich text editing
- **Tailwind CSS** for styling
- **React** for UI components

### Backend
- **FastAPI** for API endpoints
- **OpenAI API** for AI processing
- **Python 3.8+**

## Getting Started

### Prerequisites

- Node.js 18+ 
- Python 3.8+
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Vrite2.0
   ```

2. **Set up the frontend**
   ```bash
   cd vrite
   npm install
   ```

3. **Set up the backend**
   ```bash
   cd ../backend
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

### Running the Application

1. **Start the backend server**
   ```bash
   cd backend
   python app.py
   # Server runs on http://localhost:8000
   ```

2. **Start the frontend (in a new terminal)**
   ```bash
   cd vrite
   npm run dev
   # App runs on http://localhost:3000
   ```

## Usage

### Basic Editing
- Open the app and start typing in the editor
- The editor supports standard text editing features

### AI Commands
- **Cmd/Ctrl + K**: Open AI command interface
- Type commands like:
  - "Format this document according to APA standards"
  - "Make this more concise"
  - "Expand on this topic"
  - "Fix grammar and spelling"

### API Endpoints

The backend provides these endpoints:

- `POST /api/format` - Format documents according to academic standards
- `POST /api/enhance` - Enhance and generate writing
- `POST /api/command` - Process natural language commands

## Project Structure

```
Vrite2.0/
├── vrite/                 # Next.js frontend
│   ├── src/
│   │   ├── app/          # App router pages
│   │   └── components/   # React components
│   ├── package.json
│   └── tailwind.config.js
├── backend/              # FastAPI backend
│   ├── app.py           # Main FastAPI application
│   ├── requirements.txt # Python dependencies
│   └── .env.example     # Environment variables template
└── README.md
```

## Development

### Adding New Features

1. **Frontend Components**: Add to `vrite/src/components/`
2. **API Endpoints**: Add to `backend/app.py`
3. **Styling**: Use Tailwind classes or add to `globals.css`

### Environment Variables

Backend requires:
- `OPENAI_API_KEY`: Your OpenAI API key

## Contributing

This is an MVP version. Priority features for future development:

1. Document persistence and saving
2. Rich text formatting (bold, italic, headers)
3. Citation management
4. Export to PDF/DOCX
5. Collaborative editing
6. Custom AI prompts and templates

## License

MIT License