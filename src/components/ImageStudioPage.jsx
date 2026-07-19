import { useState } from 'react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Download, 
  Copy, 
  Check, 
  Loader2,
  Layers,
  Wand2,
  X,
  ArrowLeft
} from 'lucide-react';
import { generateFluxImage } from '../services/aiService.js';
import { SHOWCASE_PRESETS } from './ImageShowcaseModal.jsx';

export default function ImageStudioPage({ onBackToChat }) {
  const [activeTab, setActiveTab] = useState('generator'); // 'generator' | 'catalog'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [customPrompt, setCustomPrompt] = useState('');
  const [batchCount, setBatchCount] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [copiedPresetId, setCopiedPresetId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  const categories = ['All', 'Photorealism', 'Architecture', 'Cyberpunk', 'Fantasy', 'Sci-Fi', 'Anime & Art', 'Product & 3D', 'Landscapes', 'Minimalist'];

  const filteredPresets = selectedCategory === 'All'
    ? SHOWCASE_PRESETS
    : SHOWCASE_PRESETS.filter(p => p.category === selectedCategory);

  const handleCopyPrompt = (preset) => {
    navigator.clipboard.writeText(preset.prompt);
    setCopiedPresetId(preset.id);
    setTimeout(() => setCopiedPresetId(null), 2000);
  };

  const handleGeneratePreset = async (preset) => {
    setActiveTab('generator');
    setCustomPrompt(preset.prompt);
    await triggerSingleGeneration(preset.prompt);
  };

  const triggerSingleGeneration = async (promptToUse) => {
    if (!promptToUse.trim() || generating) return;
    setGenerating(true);
    try {
      const url = await generateFluxImage(promptToUse.trim());
      if (url) {
        setGeneratedImages(prev => [
          { id: Date.now(), prompt: promptToUse.trim(), url, createdAt: new Date() },
          ...prev
        ]);
      }
    } catch (err) {
      console.error('FLUX Image generation error:', err);
    } finally {
      setGenerating(false);
    }
  };

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
        console.error(`FLUX Image batch generation item ${i + 1} error:`, err);
      }
    }
    setGenerating(false);
  };

  return (
    <div className="image-studio-page">
      <header className="studio-header">
        <div className="studio-header-left">
          <button className="code-btn back-btn" onClick={onBackToChat} title="Back to Chat">
            <ArrowLeft size={14} />
            <span>Back to Chat</span>
          </button>
          <div className="studio-title-box">
            <Wand2 size={16} />
            <h1 className="studio-title">Image Studio</h1>
          </div>
        </div>

        <div className="studio-tabs">
          <button 
            className={`showcase-tab-btn ${activeTab === 'generator' ? 'active' : ''}`}
            onClick={() => setActiveTab('generator')}
          >
            <Sparkles size={14} />
            <span>Image Generator & Studio</span>
          </button>
          <button 
            className={`showcase-tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
          >
            <Layers size={14} />
            <span>Prompt Catalog (50 Styles)</span>
          </button>
        </div>
      </header>

      <main className="studio-main">
        {activeTab === 'generator' && (
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
                  <p>No images generated in this session yet. Type a prompt above or pick a style from the Prompt Catalog to generate up to 50 pictures.</p>
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
        )}

        {activeTab === 'catalog' && (
          <div className="studio-catalog-container">
            <div className="category-pills">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="presets-grid studio-presets-grid">
              {filteredPresets.map(preset => (
                <div key={preset.id} className="preset-card">
                  <div className="preset-card-header">
                    <span className="preset-tag">{preset.category}</span>
                    <span className="preset-num">#{preset.id}</span>
                  </div>
                  <h4 className="preset-title">{preset.name}</h4>
                  <p className="preset-prompt-text">{preset.prompt}</p>

                  <div className="preset-actions">
                    <button 
                      className="code-btn"
                      onClick={() => handleCopyPrompt(preset)}
                      title="Copy Prompt"
                    >
                      {copiedPresetId === preset.id ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedPresetId === preset.id ? 'Copied' : 'Copy Prompt'}</span>
                    </button>

                    <button 
                      className="code-btn primary-preset-btn"
                      onClick={() => handleGeneratePreset(preset)}
                      title="Generate Image"
                    >
                      <Sparkles size={12} />
                      <span>Generate Image</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
