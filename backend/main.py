"""
main.py
FastAPI backend for the RAG Document Q&A System.

Endpoints:
  GET  /health          -> check server + index status
  POST /upload           -> upload a PDF/DOCX/TXT file, index it
  POST /ask               -> ask a question about uploaded documents
"""

import os
import shutil

from dotenv import load_dotenv
load_dotenv()  # must run before rag_engine reads GOOGLE_API_KEY

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import rag_engine

app = FastAPI(title="RAG Document Q&A API")

# Allow the React frontend (running on a different port) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # for local/open-source use; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploaded_docs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "docx", "txt"}


class QuestionRequest(BaseModel):
    question: str


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "documents_indexed": rag_engine.has_documents(),
    }


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    ext = file.filename.lower().split(".")[-1]
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {ALLOWED_EXTENSIONS}",
        )

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        num_chunks = rag_engine.add_document_to_index(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to index document: {e}")

    return {
        "filename": file.filename,
        "chunks_indexed": num_chunks,
        "message": "Document indexed successfully. You can now ask questions about it.",
    }

@app.post("/reset")
async def reset_documents():
    rag_engine.reset_index()
    return {"message": "All indexed documents cleared."}

@app.post("/ask")
async def ask(request: QuestionRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    if not rag_engine.has_documents():
        raise HTTPException(
            status_code=400,
            detail="No documents indexed yet. Upload a document first.",
        )

    try:
        result = rag_engine.ask_question(request.question)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to answer question: {e}")

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
