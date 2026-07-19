import { useState } from 'react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Download, 
  Loader2,
  Wand2,
  X,
  Copy,
  Check,
  Maximize2
} from 'lucide-react';
import { generateFluxImage } from '../services/aiService.js';

export default function ImageStudioPage() {
  const [customPrompt, setCustomPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const handleGenerateSingle = async () => {
    if (!customPrompt.trim() || generating) return;
    setGenerating(true);
    const promptToUse = customPrompt.trim();

    try {
      const url = await generateFluxImage(promptToUse);
      if (url) {
        setGeneratedImages(prev => [
          { id: Date.now(), prompt: promptToUse, url, createdAt: new Date() },
          ...prev
        ]);
      }
    } catch (err) {
      console.error('Image generation error:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyPrompt = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const currentImage = generatedImages[0];
  const historyImages = generatedImages.slice(1);

  return (
    <div className="image-studio-page">
      <main className="studio-main single-mode">
        <div className="single-studio-wrapper">
          {/* Prompt Creator Box */}
          <div className="single-prompt-card">
            <div className="prompt-header-row">
              <label className="generator-label">
                <Sparkles size={14} />
                <span>Image Generator</span>
              </label>
            </div>

            <textarea 
              className="generator-textarea single-textarea"
              rows={3}
              placeholder="Describe the image you want to create (e.g. minimalist architectural render with soft lighting, 8k resolution)..."
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerateSingle();
                }
              }}
            />

            <div className="single-prompt-actions">
              <button 
                className="primary-gen-btn single-btn"
                onClick={handleGenerateSingle}
                disabled={!customPrompt.trim() || generating}
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="spin-icon" />
                    <span>Generating Image...</span>
                  </>
                ) : (
                  <>
                    <Wand2 size={14} />
                    <span>Generate Image</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Featured Single Image Display Area */}
          <div className="featured-image-display">
            {generating && (
              <div className="image-loading-card">
                <Loader2 size={32} className="spin-icon loading-spinner" />
                <p className="loading-text">Creating your image...</p>
              </div>
            )}

            {!generating && !currentImage && (
              <div className="empty-single-state">
                <ImageIcon size={32} style={{ opacity: 0.35 }} />
                <h3>No Image Created Yet</h3>
                <p>Type a prompt above and click <strong>Generate Image</strong> to create your visual artwork.</p>
              </div>
            )}

            {!generating && currentImage && (
              <div className="featured-image-card">
                <div className="featured-img-frame" onClick={() => setPreviewImage(currentImage.url)}>
                  <img 
                    src={currentImage.url} 
                    alt={currentImage.prompt} 
                    className="featured-img"
                  />
                  <div className="featured-img-overlay">
                    <button 
                      className="icon-btn overlay-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewImage(currentImage.url);
                      }}
                      title="Enlarge Image"
                    >
                      <Maximize2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="featured-img-meta">
                  <p className="featured-prompt-text">{currentImage.prompt}</p>
                  <div className="featured-action-bar">
                    <button 
                      className="code-btn"
                      onClick={() => handleCopyPrompt(currentImage.id, currentImage.prompt)}
                      title="Copy Prompt"
                    >
                      {copiedId === currentImage.id ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedId === currentImage.id ? 'Copied' : 'Copy Prompt'}</span>
                    </button>

                    <a 
                      href={currentImage.url} 
                      download={`generated-image-${currentImage.id}.png`}
                      className="code-btn primary-preset-btn"
                      title="Download PNG"
                    >
                      <Download size={12} />
                      <span>Download PNG</span>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* History Gallery if multiple single generations */}
          {historyImages.length > 0 && (
            <div className="history-gallery-section">
              <h4 className="history-section-title">Previous Creations ({historyImages.length})</h4>
              <div className="history-images-grid">
                {historyImages.map(img => (
                  <div key={img.id} className="history-img-card" onClick={() => setPreviewImage(img.url)}>
                    <img src={img.url} alt={img.prompt} className="history-img-thumb" />
                    <div className="history-img-caption">
                      <p className="caption-text">{img.prompt}</p>
                      <a 
                        href={img.url} 
                        download={`generated-image-${img.id}.png`}
                        className="code-btn download-btn"
                        onClick={e => e.stopPropagation()}
                        title="Download"
                      >
                        <Download size={12} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Lightbox Modal */}
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
