import { useState, useRef } from 'react'

const API_BASE = 'http://localhost:8000'

export default function App() {
  const [file, setFile] = useState(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploading, setUploading] = useState(false)

  const [resetStatus, setResetStatus] = useState('')
  const [resetting, setResetting] = useState(false)

  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [asking, setAsking] = useState(false)

  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    setFile(e.target.files[0])
    setUploadStatus('')
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setUploadStatus('Uploading and indexing...')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      setUploadStatus(`✅ ${data.filename} indexed (${data.chunks_indexed} chunks). Ask away!`)
    } catch (err) {
      setUploadStatus(`❌ ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    setResetStatus('')
    try {
      const res = await fetch(`${API_BASE}/reset`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Reset failed')
      setResetStatus('✅ All documents cleared. Upload a new one to start fresh.')
      setMessages([])
      setUploadStatus('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setResetStatus(`❌ ${err.message}`)
    } finally {
      setResetting(false)
    }
  }

  const handleAsk = async () => {
    if (!question.trim()) return
    const userMsg = { role: 'user', text: question }
    setMessages((prev) => [...prev, userMsg])
    setQuestion('')
    setAsking(true)

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg.text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to get answer')
      setMessages((prev) => [...prev, { role: 'bot', text: data.answer, sources: data.sources }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'bot', text: `❌ ${err.message}` }])
    } finally {
      setAsking(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  return (
    <div className="page">
      <div className="container">
        <header className="header">
          <div className="header-icon">📄</div>
          <h1>RAG Document Q&A</h1>
          <p className="subtitle">
            Ask questions about your own documents and get answers grounded in their actual content.
          </p>
        </header>

        <section className="info-card">
          <h2>What is this?</h2>
          <p>
            This is a <strong>Retrieval-Augmented Generation (RAG)</strong> app. Instead of an AI
            guessing from general knowledge, it reads <em>your</em> uploaded document, finds the
            most relevant sections, and answers strictly based on that content — so answers are
            accurate and traceable back to the source file.
          </p>
          <div className="steps">
            <div className="step">
              <span className="step-num">1</span>
              <span>Upload a PDF, DOCX, or TXT file</span>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <span>It's split into chunks and embedded into a searchable index</span>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <span>Ask a question — the most relevant chunks are retrieved</span>
            </div>
            <div className="step">
              <span className="step-num">4</span>
              <span>An LLM answers using only that retrieved context</span>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>1. Upload a document</h3>
          <div className="upload-row">
            <label className="file-label">
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              {file ? file.name : 'Choose a file...'}
            </label>
            <button onClick={handleUpload} disabled={!file || uploading} className="primary-btn">
              {uploading ? 'Indexing...' : 'Upload & Index'}
            </button>
            <button onClick={handleReset} disabled={resetting} className="danger-btn">
              {resetting ? 'Clearing...' : '🗑 Clear'}
            </button>
          </div>
          {uploadStatus && <p className="status">{uploadStatus}</p>}
          {resetStatus && <p className="status">{resetStatus}</p>}
          <p className="hint-note">
            ℹ️ Documents stay indexed across sessions. If you're testing a
            <strong> new file</strong>, click <strong>🗑 Clear</strong> first - otherwise
            answers may mix in content from a previously uploaded document.
          </p>
        </section>

        <section className="card chat-section">
          <h3>2. Ask a question</h3>
          <div className="chat-box">
            {messages.length === 0 && (
              <p className="empty-hint">No messages yet — upload a document above, then ask something about it.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bubble-row ${m.role}`}>
                <div className={`avatar ${m.role}`}>{m.role === 'user' ? '🙂' : '✨'}</div>
                <div className={`bubble ${m.role}`}>
                  <div className="bubble-text">{m.text}</div>
                  {m.sources && m.sources.length > 0 && (
                    <div className="sources">📎 {m.sources.join(', ')}</div>
                  )}
                </div>
              </div>
            ))}
            {asking && (
              <div className="bubble-row bot">
                <div className="avatar bot">✨</div>
                <div className="bubble bot typing">
                  <span className="dot"></span><span className="dot"></span><span className="dot"></span>
                </div>
              </div>
            )}
          </div>

          <div className="input-row">
            <textarea
              rows={2}
              placeholder="Ask a question about your document..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button onClick={handleAsk} disabled={asking || !question.trim()} className="primary-btn">
              {asking ? '...' : 'Ask'}
            </button>
          </div>
        </section>

        <footer className="footer">
          Built with FastAPI, LangChain, ChromaDB & Groq — open source
        </footer>
      </div>
    </div>
  )
}