"""
rag_engine.py
Core RAG (Retrieval-Augmented Generation) logic:
- Load documents (PDF, DOCX, TXT)
- Split into chunks
- Embed chunks (free, local, open-source embedding model)
- Store/retrieve from a persistent Chroma vector database
- Ask questions using Groq (free, fast LLM)
"""

import os
from typing import List

from langchain_community.document_loaders import (
    PyPDFLoader,
    Docx2txtLoader,
    TextLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_groq import ChatGroq

# ---------- CONFIG ----------
CHROMA_DIR = "chroma_store"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
LLM_MODEL = "llama-3.3-70b-versatile"  # free on Groq, fast and capable

PROMPT_TEMPLATE = """Answer the question based only on the context below.
If the answer is not contained in the context, say "I don't know based on the provided document."

Context:
{context}

Question: {question}

Answer:"""

_embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
_vectorstore = None

def get_vectorstore() -> Chroma:
    global _vectorstore
    if _vectorstore is None:
        _vectorstore = Chroma(
            persist_directory=CHROMA_DIR,
            embedding_function=_embeddings,
        )
    return _vectorstore


def reset_index():
    """Delete all indexed documents and start fresh."""
    global _vectorstore
    vectorstore = get_vectorstore()
    try:
        vectorstore.delete_collection()
    except Exception:
        pass
    _vectorstore = None

def load_document(file_path: str):
    ext = file_path.lower().split(".")[-1]
    if ext == "pdf":
        loader = PyPDFLoader(file_path)
    elif ext == "docx":
        loader = Docx2txtLoader(file_path)
    elif ext == "txt":
        loader = TextLoader(file_path, encoding="utf-8")
    else:
        raise ValueError(f"Unsupported file type: .{ext}")
    return loader.load()


def add_document_to_index(file_path: str) -> int:
    docs = load_document(file_path)

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    chunks = splitter.split_documents(docs)

    filename = os.path.basename(file_path)
    for chunk in chunks:
        chunk.metadata["source"] = filename

    vectorstore = get_vectorstore()
    vectorstore.add_documents(chunks)

    return len(chunks)


def ask_question(question: str, k: int = 4) -> dict:
    if not os.environ.get("GROQ_API_KEY"):
        raise RuntimeError(
            "GROQ_API_KEY is not set. Add it to your .env file. "
            "Get a free key at https://console.groq.com/keys"
        )

    vectorstore = get_vectorstore()
    retriever = vectorstore.as_retriever(search_kwargs={"k": k})

    docs = retriever.invoke(question)
    context = "\n\n".join(doc.page_content for doc in docs)

    prompt = PROMPT_TEMPLATE.format(context=context, question=question)

    llm = ChatGroq(model=LLM_MODEL, temperature=0.2)
    response = llm.invoke(prompt)

    sources: List[str] = list(
        {doc.metadata.get("source", "unknown") for doc in docs}
    )

    return {
        "answer": response.content,
        "sources": sources,
    }


def has_documents() -> bool:
    vectorstore = get_vectorstore()
    try:
        return vectorstore._collection.count() > 0
    except Exception:
        return False