import { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Download, 
  Loader2, 
  Send,
  X,
  Copy,
  Check,
  Maximize2,
  Trash2
} from 'lucide-react';
import { generateFluxImage } from '../services/aiService.js';

export default function ImageStudioPage() {
  const [promptInput, setPromptInput] = useState('');
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

  const handleGenerate = async (e) => {
    e?.preventDefault();
    const cleanPrompt = promptInput.trim();
    if (!cleanPrompt || generating) return;

    setGenerating(true);
    setPromptInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const url = await generateFluxImage(cleanPrompt);
      if (url) {
        const newImg = {
          id: Date.now(),
          prompt: cleanPrompt,
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleCopyPrompt = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteImage = (id, e) => {
    e?.stopPropagation();
    setGeneratedImages(prev => prev.filter(img => img.id !== id));
  };

  return (
    <div className="image-studio-page">
      <main className="studio-main chatbox-mode">
        <div className="chatbox-studio-container">
          
          {/* Showcase Section at the top */}
          <div className="showcase-gallery-section">
            <div className="showcase-header">
              <div className="showcase-title">
                <ImageIcon size={16} />
                <span>Image Showcase ({generatedImages.length})</span>
              </div>
              {generatedImages.length > 0 && (
                <button 
                  className="code-btn clear-all-btn"
                  onClick={() => setGeneratedImages([])}
                  title="Clear Showcase"
                >
                  <Trash2 size={12} />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {generating && (
              <div className="image-loading-card">
                <Loader2 size={28} className="spin-icon loading-spinner" />
                <p className="loading-text">Generating your image...</p>
              </div>
            )}

            {!generating && generatedImages.length === 0 && (
              <div className="empty-single-state">
                <ImageIcon size={32} style={{ opacity: 0.35 }} />
                <h3>Your Image Showcase</h3>
                <p>Generated images will be stored and showcased here once created using the chatbox below.</p>
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
                          <Maximize2 size={15} />
                        </button>
                        <button 
                          className="icon-btn overlay-btn delete-btn"
                          onClick={(e) => handleDeleteImage(img.id, e)}
                          title="Delete Image"
                        >
                          <Trash2 size={14} />
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
                          {copiedId === img.id ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                        <a 
                          href={img.url} 
                          download={`generated-image-${img.id}.png`}
                          className="code-btn download-btn"
                          onClick={e => e.stopPropagation()}
                          title="Download Image"
                        >
                          <Download size={12} />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chatbox Input area at the bottom matching ChatInput styling */}
          <div className="studio-chatbox-wrapper">
            <form onSubmit={handleGenerate} className="input-box studio-input-box">
              <textarea
                ref={textareaRef}
                className="chat-textarea"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe an image to generate..."
                rows={1}
                disabled={generating}
              />
              <div className="input-actions-bar">
                <button
                  type="submit"
                  className="send-btn"
                  disabled={!promptInput.trim() || generating}
                  title="Generate Image"
                >
                  {generating ? <Loader2 size={15} className="spin-icon" /> : <Send size={15} />}
                </button>
              </div>
            </form>
          </div>

        </div>
      </main>

      {/* Lightbox Preview Modal */}
      {previewImage && (
        <div className="image-lightbox-modal" onClick={() => setPreviewImage(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={previewImage} alt="Preview Image" className="lightbox-img" />
            <button className="icon-btn close-lightbox" onClick={() => setPreviewImage(null)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
