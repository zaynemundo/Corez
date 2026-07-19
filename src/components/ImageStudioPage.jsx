import { useState } from 'react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Download, 
  Loader2,
  Wand2,
  X
} from 'lucide-react';
import { generateFluxImage } from '../services/aiService.js';

export default function ImageStudioPage() {
  const [customPrompt, setCustomPrompt] = useState('');
  const [batchCount, setBatchCount] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);

  const handleBatchGenerate = async () => {
    if (!customPrompt.trim() || generating) return;
    setGenerating(true);
    const countToGenerate = Math.min(Math.max(1, batchCount), 50);

    for (let i = 0; i < countToGenerate; i++) {
      try {
        const variationPrompt = countToGenerate > 1 
          ? `${customPrompt.trim()}, variation ${i + 1}, unique camera angle`
          : customPrompt.trim();
        const url = await generateFluxImage(variationPrompt);
        if (url) {
          setGeneratedImages(prev => [
            { id: Date.now() + i, prompt: variationPrompt, url, createdAt: new Date() },
            ...prev
          ]);
        }
      } catch (err) {
        console.error(`Image generation item ${i + 1} error:`, err);
      }
    }
    setGenerating(false);
  };

  return (
    <div className="image-studio-page">
      <main className="studio-main">
        <div className="studio-generator-container">
          <div className="generator-input-card">
            <label className="generator-label">Image Prompt:</label>
            <textarea 
              className="generator-textarea"
              rows={3}
              placeholder="Describe any scene, art style, product, architecture, or creative concept you want to generate..."
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
            />

            <div className="generator-controls">
              <div className="batch-control">
                <label className="batch-label">Pictures count (1-50):</label>
                <input 
                  type="number"
                  min={1}
                  max={50}
                  value={batchCount}
                  onChange={e => setBatchCount(parseInt(e.target.value) || 1)}
                  className="batch-input"
                />
              </div>

              <button 
                className="canvas-toggle-btn primary-gen-btn"
                onClick={handleBatchGenerate}
                disabled={!customPrompt.trim() || generating}
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="spin-icon" />
                    <span>Generating Image(s)...</span>
                  </>
                ) : (
                  <>
                    <Wand2 size={14} />
                    <span>Generate {batchCount > 1 ? `${batchCount} Images` : 'Image'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="generated-gallery-section">
            <h3 className="gallery-section-title">
              <ImageIcon size={15} />
              <span>Generated Pictures ({generatedImages.length})</span>
            </h3>

            {generatedImages.length === 0 ? (
              <div className="empty-gallery-state">
                <Wand2 size={28} style={{ opacity: 0.4 }} />
                <p>No images generated in this session yet. Enter a prompt above to create up to 50 pictures.</p>
              </div>
            ) : (
              <div className="generated-images-grid studio-grid">
                {generatedImages.map(img => (
                  <div key={img.id} className="generated-img-card">
                    <img 
                      src={img.url} 
                      alt={img.prompt} 
                      className="generated-img-thumb"
                      onClick={() => setPreviewImage(img.url)}
                    />
                    <div className="img-card-caption">
                      <p className="caption-text">{img.prompt}</p>
                      <a 
                        href={img.url} 
                        download={`generated-image-${img.id}.png`}
                        className="code-btn download-btn"
                        title="Download Image"
                      >
                        <Download size={12} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

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
