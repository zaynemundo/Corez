import { useState, useRef, useEffect } from 'react';
import { 
  Image as ImageIcon, 
  Download, 
  Loader2, 
  Send,
  X,
  Copy,
  Check,
  Maximize2,
  Trash2,
  Paperclip,
  FileText
} from 'lucide-react';
import { generateFluxImage } from '../services/aiService.js';
import ProgressChecklist from './ProgressChecklist';

export default function ImageStudioPage() {
  const [promptInput, setPromptInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState(() => {
    try {
      const saved = localStorage.getItem('corez_generated_images');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [previewImage, setPreviewImage] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('corez_generated_images', JSON.stringify(generatedImages));
    } catch (err) {
      console.warn('Failed to save generated images to localStorage', err);
    }
  }, [generatedImages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [promptInput]);

  const processFiles = (files) => {
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const fileId = Date.now() + Math.random();
      const isImage = file.type.startsWith('image/');
      const isTextFile = ['text/plain', 'text/csv', 'text/markdown', 'application/json', 'text/html', 'text/xml'].includes(file.type) || file.name.match(/\.(txt|md|csv|json|xml|html|js|ts|jsx|tsx|css|py|java|rs|go|sh)$/i);

      const reader = new FileReader();
      if (isImage) {
        reader.onload = (e) => {
          setAttachments(prev => [...prev, {
            id: fileId,
            name: file.name,
            type: 'image',
            dataUrl: e.target.result
          }]);
        };
        reader.readAsDataURL(file);
      } else if (isTextFile) {
        reader.onload = (e) => {
          setAttachments(prev => [...prev, {
            id: fileId,
            name: file.name,
            type: 'document',
            text: e.target.result
          }]);
        };
        reader.readAsText(file);
      }
    });
  };

  const handleFileChange = (e) => {
    processFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeAttachment = (id) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleGenerate = async (cleanPromptText) => {
    const rawText = typeof cleanPromptText === 'string' ? cleanPromptText : promptInput.trim();
    if ((!rawText && attachments.length === 0) || generating) return;

    // Combine user prompt with attached document context & image hints
    let finalPrompt = rawText;
    const docTexts = attachments.filter(a => a.type === 'document' && a.text).map(a => a.text.slice(0, 500));
    if (docTexts.length > 0) {
      finalPrompt += ` [Document Context: ${docTexts.join('; ')}]`;
    }

    const imageCount = attachments.filter(a => a.type === 'image').length;
    if (imageCount > 0) {
      finalPrompt += ` [Image Reference Attached: ${imageCount} image(s)]`;
    }

    setGenerating(true);
    setPromptInput('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const url = await generateFluxImage(finalPrompt);
      if (url) {
        const newImg = {
          id: Date.now(),
          prompt: finalPrompt,
          url,
          createdAt: new Date().toISOString()
        };
        setGeneratedImages(prev => [newImg, ...prev]);
      }
    } catch (err) {
      console.error('Image generation error:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    handleGenerate(promptInput.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopyPrompt = (id, text) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteImage = (id, e) => {
    e?.stopPropagation();
    setGeneratedImages(prev => prev.filter(img => img.id !== id));
  };

  return (
    <div className="chat-pane studio-pane">
      <div className="messages-scroll studio-scroll">
        {generatedImages.length === 0 && !generating ? (
          <div className="welcome-container">
            <h1 className="welcome-title">COREZ STUDIO</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Create high-quality 8-bit game assets, pixel art sprites, and visual artwork
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', maxWidth: '640px' }}>
              <button 
                type="button"
                className="code-btn"
                style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--bg-tertiary)' }}
                onClick={() => handleGenerate('8-bit pixel art knight sprite sheet, 16x16 pixel grid, itch.io game asset, PICO-8 retro palette, crisp outline')}
              >
                ⚔️ 8-Bit Knight Sprites
              </button>
              <button 
                type="button"
                className="code-btn"
                style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--bg-tertiary)' }}
                onClick={() => handleGenerate('8-bit pixel art RPG items set, potion flasks, enchanted swords, shields, treasure chest, itch.io 8-bit game asset style')}
              >
                🛡️ 8-Bit Weapons & Potions
              </button>
              <button 
                type="button"
                className="code-btn"
                style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--bg-tertiary)' }}
                onClick={() => handleGenerate('8-bit pixel art retro dungeon tileset, stone brick walls, floor tiles, torch, door, lava, itch.io 8-bit game asset pack')}
              >
                🏰 8-Bit Dungeon Tileset
              </button>
              <button 
                type="button"
                className="code-btn"
                style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--bg-tertiary)' }}
                onClick={() => handleGenerate('8-bit retro arcade monster sprites, slime, goblin, dragon, skull, itch.io 8-bit game asset tag style, vibrant NES palette')}
              >
                👾 8-Bit Arcade Monsters
              </button>
            </div>
          </div>
        ) : (
          <div className="messages-inner studio-messages-inner">
            <div className="showcase-header-row">
              <div className="showcase-title">
                <ImageIcon size={16} strokeWidth={1.5} />
                <span>Image Showcase ({generatedImages.length})</span>
              </div>
              {generatedImages.length > 0 && (
                <button 
                  className="code-btn clear-all-btn"
                  onClick={() => setGeneratedImages([])}
                  title="Clear Showcase"
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {generating && (
              <div className="message-wrapper ai">
                <div className="message-body">
                  <ProgressChecklist taskType="image" customTitle="Generating Visual Artwork" />
                </div>
              </div>
            )}

            {generatedImages.length > 0 && (
              <div className="showcase-images-grid">
                {generatedImages.map((img, index) => (
                  <div 
                    key={img.id} 
                    className={`showcase-img-card ${index === 0 ? 'latest-card' : ''}`}
                    onClick={() => setPreviewImage(img.url)}
                  >
                    <div className="showcase-img-wrapper">
                      <img src={img.url} alt={img.prompt} className="showcase-img" />
                      <div className="showcase-img-overlay">
                        <button 
                          className="icon-btn overlay-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(img.url);
                          }}
                          title="Enlarge Image"
                        >
                          <Maximize2 size={15} strokeWidth={1.5} />
                        </button>
                        <button 
                          className="icon-btn overlay-btn delete-btn"
                          onClick={(e) => handleDeleteImage(img.id, e)}
                          title="Delete Image"
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>

                    <div className="showcase-card-caption">
                      <p className="caption-text">{img.prompt}</p>
                      <div className="caption-actions">
                        <button 
                          className="code-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPrompt(img.id, img.prompt);
                          }}
                          title="Copy Prompt"
                        >
                          {copiedId === img.id ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
                        </button>
                        <a 
                          href={img.url} 
                          download={`generated-image-${img.id}.png`}
                          className="code-btn download-btn"
                          onClick={e => e.stopPropagation()}
                          title="Download Image"
                        >
                          <Download size={12} strokeWidth={1.5} />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Form with Image & Document Attachments + Drag & Drop */}
      <div className="chat-input-container">
        <form 
          onSubmit={handleSubmit} 
          className="input-box studio-input-box"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json"
          />

          <button
            type="button"
            className="icon-btn attach-file-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach Document or Image"
            disabled={generating}
          >
            <Paperclip size={16} strokeWidth={1.5} />
          </button>

          <div className="input-textarea-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {attachments.length > 0 && (
              <div className="attachment-chips-bar">
                {attachments.map(att => (
                  <div key={att.id} className="attachment-chip">
                    {att.type === 'image' ? (
                      <img src={att.dataUrl} alt={att.name} className="attachment-chip-thumb" />
                    ) : (
                      <FileText size={13} strokeWidth={1.5} />
                    )}
                    <span className="chip-filename">{att.name}</span>
                    <button 
                      type="button" 
                      className="remove-chip-btn" 
                      onClick={() => removeAttachment(att.id)}
                      title="Remove attachment"
                    >
                      <X size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              className="chat-textarea"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Imagine with Corez..."
              aria-label="Describe the image to generate"
              rows={1}
              disabled={generating}
            />
          </div>

          <div className="input-actions-bar">
            <button
              type="submit"
              className="send-btn"
              disabled={(!promptInput.trim() && attachments.length === 0) || generating}
              title="Generate Image"
            >
              {generating ? <Loader2 size={15} strokeWidth={1.5} className="spin-icon" /> : <Send size={15} strokeWidth={1.5} />}
            </button>
          </div>
        </form>
      </div>

      {/* Lightbox Preview Modal */}
      {previewImage && (
        <div className="image-lightbox-modal" onClick={() => setPreviewImage(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={previewImage} alt="Preview Image" className="lightbox-img" />
            <button className="icon-btn close-lightbox" onClick={() => setPreviewImage(null)} aria-label="Close preview">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
