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
  Wand2,
  Sparkles,
  Camera,
  Layers
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

  const handleGenerate = async (cleanPromptText) => {
    const textToUse = typeof cleanPromptText === 'string' ? cleanPromptText : promptInput.trim();
    if (!textToUse || generating) return;

    setGenerating(true);
    setPromptInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const url = await generateFluxImage(textToUse);
      if (url) {
        const newImg = {
          id: Date.now(),
          prompt: textToUse,
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
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteImage = (id, e) => {
    e?.stopPropagation();
    setGeneratedImages(prev => prev.filter(img => img.id !== id));
  };

  const SAMPLE_IMAGE_PROMPTS = [
    {
      title: 'Minimalist Architecture',
      desc: 'Monochrome modern concrete villa with glass facade and ambient twilight lighting.',
      prompt: 'Monochrome modern concrete villa with glass facade, ambient twilight lighting, archdaily architectural photography 8k.'
    },
    {
      title: 'Cyberpunk Neon Street',
      desc: 'Rain-soaked Tokyo alleyway with reflections, dark cinematic aesthetic.',
      prompt: 'Rain-soaked Tokyo alleyway with reflections, cyberpunk neon glow, dark cinematic aesthetic, high resolution shot.'
    },
    {
      title: 'Studio Product Render',
      desc: 'Sleek matte black smartwatch on obsidian pedestal with soft rim light.',
      prompt: 'Sleek matte black smartwatch on obsidian pedestal, soft rim lighting, industrial product studio photography 3d render.'
    }
  ];

  return (
    <div className="chat-pane studio-pane">
      <div className="messages-scroll studio-scroll">
        {generatedImages.length === 0 && !generating ? (
          <div className="welcome-container">
            <div className="welcome-logo">
              <ImageIcon size={24} />
            </div>
            <h1 className="welcome-title">Image Studio</h1>
            <p className="welcome-sub">
              Describe any image to generate high-resolution visual artwork and store it in your showcase.
            </p>

            <div className="sample-prompts-grid">
              {SAMPLE_IMAGE_PROMPTS.map((sample, idx) => (
                <div 
                  key={idx}
                  className="sample-prompt-card"
                  onClick={() => handleGenerate(sample.prompt)}
                >
                  <div className="prompt-title">
                    <Sparkles size={14} style={{ color: 'var(--text-primary)' }} />
                    <span>{sample.title}</span>
                  </div>
                  <div className="prompt-desc">{sample.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages-inner studio-messages-inner">
            <div className="showcase-header-row">
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
              <div className="message-wrapper ai">
                <div className="message-body">
                  <div className="thinking-indicator-box" aria-label="Generating Image" role="status">
                    <span className="thinking-text">Generating Image</span>
                    <span className="thinking-dots" aria-hidden="true">
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                    </span>
                  </div>
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
        )}
      </div>

      {/* ChatInput - Identical structure & positioning as main ChatInput */}
      <div className="chat-input-container">
        <form onSubmit={handleSubmit} className="input-box">
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
