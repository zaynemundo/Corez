import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, FileText, X, UploadCloud } from 'lucide-react';
import { readDocumentFile } from '../utils/documentHelper';

export default function ChatInput({ onSendMessage, isStreaming }) {
  const [input, setInput] = useState('');
  const [attachedDocs, setAttachedDocs] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  const processFiles = async (files) => {
    const fileList = Array.from(files);
    if (!fileList.length) return;

    try {
      const parsedDocs = await Promise.all(fileList.map(file => readDocumentFile(file)));
      setAttachedDocs(prev => [...prev, ...parsedDocs]);
    } catch (err) {
      console.error('Error reading attached document(s):', err);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleRemoveDoc = (docId) => {
    setAttachedDocs(prev => prev.filter(d => d.id !== docId));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    const hasText = !!input.trim();
    const hasDocs = attachedDocs.length > 0;
    
    if ((!hasText && !hasDocs) || isStreaming) return;

    const finalPrompt = hasText ? input.trim() : `Analyze attached document${attachedDocs.length > 1 ? 's' : ''}: ${attachedDocs.map(d => d.name).join(', ')}`;
    onSendMessage(finalPrompt, attachedDocs);
    setInput('');
    setAttachedDocs([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = (!!input.trim() || attachedDocs.length > 0) && !isStreaming;

  return (
    <div className="chat-input-container">
      <form 
        onSubmit={handleSubmit} 
        className={`input-box ${isDragging ? 'dragging-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="drag-drop-overlay">
            <UploadCloud size={20} />
            <span>Drop documents here to attach</span>
          </div>
        )}

        {attachedDocs.length > 0 && (
          <div className="attached-docs-bar">
            {attachedDocs.map((doc) => (
              <div key={doc.id} className="attached-doc-chip" title={`${doc.name} (${doc.size})`}>
                <FileText size={13} className="doc-chip-icon" />
                <span className="doc-chip-name">{doc.name}</span>
                <span className="doc-chip-size">{doc.size}</span>
                <button
                  type="button"
                  className="doc-chip-remove"
                  onClick={() => handleRemoveDoc(doc.id)}
                  title="Remove attachment"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="input-row">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachedDocs.length > 0 ? "Ask Corez about these documents..." : "Ask Corez or attach documents..."}
            rows={1}
            disabled={isStreaming}
          />

          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept=".txt,.md,.json,.csv,.pdf,.doc,.docx,.js,.jsx,.ts,.tsx,.py,.html,.css,.xml,.yaml,.yml,.sql,.log"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          <div className="input-actions-bar">
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Attach Document (.txt, .pdf, .md, .csv, .json, code files)"
            >
              <Paperclip size={15} />
            </button>

            <button
              type="submit"
              className="send-btn"
              disabled={!canSubmit}
              title="Send Message"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
