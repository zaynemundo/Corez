import { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Image as ImageIcon, 
  Download, 
  Copy, 
  Check, 
  Loader2,
  Layers,
  Wand2
} from 'lucide-react';
import { generateFluxImage } from '../services/aiService.js';

export const SHOWCASE_PRESETS = [
  { id: 1, name: "Cyberpunk Neon", category: "Neon", prompt: "Cyberpunk glowing neon typography text reading COREZ on a dark rainy alley wall, 8k resolution, octane render" },
  { id: 2, name: "Brutalist Bold", category: "Brutalist", prompt: "Heavy stark black brutalist typography poster with bold geometric sans-serif lettering, high contrast monochrome" },
  { id: 3, name: "3D Chrome Metallic", category: "3D", prompt: "Ultra reflective 3D fluid liquid chrome metallic logo lettering COREZ floating on black background, photorealistic 8k" },
  { id: 4, name: "Calligraphic Liquid Ink", category: "Artistic", prompt: "Dynamic black liquid ink splash calligraphy lettering on textured white watercolor paper, minimal art" },
  { id: 5, name: "Swiss Minimalist Serif", category: "Serif", prompt: "Elegant high-fashion magazine cover with minimalist serif typography COREZ, editorial layout, subtle grain" },
  { id: 6, name: "80s Retro Synthwave", category: "Retro", prompt: "Retro 1980s synthwave chrome logo text with grid landscape background and sunset glow, vibrant 80s aesthetic" },
  { id: 7, name: "Futuristic Hologram", category: "Sci-Fi", prompt: "Futuristic holographic glowing blue wireframe glyph font in dark space, cyberpunk hud display" },
  { id: 8, name: "Gothic Blackletter", category: "Vintage", prompt: "Intricate ornate medieval gothic blackletter typography engraved in dark oxidized silver plate" },
  { id: 9, name: "Frosted Glassmorphism", category: "Glass", prompt: "Translucent frosted glass typography COREZ with soft ambient gradient refraction and blur" },
  { id: 10, name: "Origami Paper Fold", category: "Paper", prompt: "Clean white origami folded paper 3D typography sculpture on soft pastel grey studio backdrop" },
  { id: 11, name: "Bioluminescent Glow", category: "Nature", prompt: "Bioluminescent glowing deep ocean organism forming organic typography COREZ in pitch dark water" },
  { id: 12, name: "Vintage Engraved Wood", category: "Vintage", prompt: "Classic 19th-century vintage hand-carved woodblock typography poster print with detailed linework" },
  { id: 13, name: "Neon Wireframe 3D", category: "3D", prompt: "3D vector neon wireframe geometry creating structural typography letters COREZ on black background" },
  { id: 14, name: "Carved White Marble", category: "Stone", prompt: "Ancient Roman classical typography carved deeply into pristine white marble stone with shadow" },
  { id: 15, name: "Abstract Geometric Stencil", category: "Modern", prompt: "Abstract Bauhaus geometric stencil typography design with sharp architectural shapes and minimal lines" },
  { id: 16, name: "Cybernetic Circuit Board", category: "Sci-Fi", prompt: "Gold electronic circuit board traces forming sharp futuristic typography COREZ on black PCB" },
  { id: 17, name: "Vapor Smoke Art", category: "Abstract", prompt: "Ethereal wisps of white smoke curling into elegant cursive typography against pitch black darkness" },
  { id: 18, name: "Golden Luxury Monogram", category: "Luxury", prompt: "Luxury 24k polished gold monogram typography logo embossed on dark matte velvet texture" },
  { id: 19, name: "Pixel Art Arcade", category: "Retro", prompt: "Retro 16-bit arcade pixel art title text COREZ with 80s video game color palette" },
  { id: 20, name: "Isometric 3D Blocks", category: "3D", prompt: "Vibrant isometric 3D architectural block letters forming word COREZ in clean studio lighting" },
  { id: 21, name: "Molten Lava Glow", category: "Elemental", prompt: "Cracked volcanic rock with glowing molten lava burning through letter shapes COREZ" },
  { id: 22, name: "Monospaced Hacker Code", category: "Minimal", prompt: "Clean monospaced terminal code font in phosphor green CRT screen effect" },
  { id: 23, name: "Watercolor Brush Script", category: "Artistic", prompt: "Expressive wet watercolor brush script typography with soft ink bleeding on textured canvas" },
  { id: 24, name: "Industrial Stencil Steel", category: "Industrial", prompt: "Heavy industrial steel stencil typography with weathered paint and rivet details on dark metal" },
  { id: 25, name: "Holographic Iridescent Foil", category: "Holographic", prompt: "Shimmering rainbow holographic foil stamping typography COREZ on dark textured cardstock" },
  { id: 26, name: "Pop Art Comic Book", category: "Comic", prompt: "1960s pop art comic book action typography with halftone dots and bold black outlines" },
  { id: 27, name: "Art Deco Gold Leaf", category: "Art Deco", prompt: "1920s Art Deco geometric typography with gold leaf inlay on black marble background" },
  { id: 28, name: "Cosmic Nebula Stars", category: "Space", prompt: "Deep space cosmic nebula clouds forming galaxy typography COREZ with twinkling stars" },
  { id: 29, name: "Kinetic Motion Blur", category: "Modern", prompt: "Modern kinetic typography poster with dynamic high-speed motion blur trails and sharp typography" },
  { id: 30, name: "Rustic Carved Timber", category: "Wood", prompt: "Rustic hand-carved oak wood timber sign typography with visible wood grain and craft texture" },
  { id: 31, name: "Liquid Mercury Chrome", category: "Liquid", prompt: "Liquid mercury fluid metal typography ripple effect on dark glossy mirror surface" },
  { id: 32, name: "Chalkboard Handwritten", category: "Handdrawn", prompt: "Detailed vintage cafe chalkboard typography lettering with chalk dust texture" },
  { id: 33, name: "Retro Groovy 70s Bubble", category: "Retro", prompt: "1970s psychedelic groovy bubble font typography with warm sunset gradient palette" },
  { id: 34, name: "Cyber Neon Sign", category: "Neon", prompt: "Realistic glass tube neon sign glowing bright red and cyan on dark brick wall" },
  { id: 35, name: "Micro Minimalist Type", category: "Minimal", prompt: "Ultra minimalist Swiss typography poster layout with tiny high-precision serif text and wide margin" },
  { id: 36, name: "Frozen Crystal Ice", category: "Elemental", prompt: "Intricate frozen crystal ice typography COREZ with frost particles and sharp glacial edges" },
  { id: 37, name: "Steampunk Brass Gears", category: "Steampunk", prompt: "Victorian steampunk brass gear mechanism forming intricate clockwork typography letters" },
  { id: 38, name: "Digital Glitch Distortion", category: "Glitch", prompt: "Digital RGB glitch displacement distortion typography COREZ on dark noise screen" },
  { id: 39, name: "Paper Cutout Layers", category: "Paper", prompt: "Layered 3D paper cutout typography creating depth with soft shadow layers in pastel tones" },
  { id: 40, name: "Desert Sand Dunes", category: "Stone", prompt: "Giant desert sand dune ripple patterns forming ancient typographic letters from aerial view" },
  { id: 41, name: "Op-Art Optical Illusion", category: "Abstract", prompt: "Black and white optical illusion op-art geometric pattern creating dynamic typographic letterforms" },
  { id: 42, name: "High Contrast Fashion Serif", category: "Serif", prompt: "High contrast luxury fashion editorial typography with dramatic thin and thick serif stems" },
  { id: 43, name: "Claymation 3D Plasticine", category: "3D", prompt: "Playful claymation 3D plasticine clay typography sculpture with subtle handmade fingerprints" },
  { id: 44, name: "Laser Beam Neon", category: "Neon", prompt: "Intense red laser light beams intersecting in dark foggy space to form letter shapes" },
  { id: 45, name: "Concrete Brutalism", category: "Architecture", prompt: "Raw architectural poured concrete 3D typography COREZ with subtle cement texture and shadows" },
  { id: 46, name: "Electric Lightning Spark", category: "Elemental", prompt: "High voltage electrical arcs and lightning sparks outlining bold typography in dark atmosphere" },
  { id: 47, name: "Silkscreen Print Poster", category: "Artistic", prompt: "Minimalist two-tone silkscreen print poster typography with subtle ink registration misalignment" },
  { id: 48, name: "Floating Foil Balloon 3D", category: "3D", prompt: "Shiny chrome silver 3D foil balloon letters COREZ floating in clean studio lighting" },
  { id: 49, name: "Matrix Code Rain", category: "Sci-Fi", prompt: "Green digital matrix glyph code rain cascading into letter shapes on dark screen" },
  { id: 50, name: "Luxury Cursive Signature", category: "Script", prompt: "Fluid luxury gold foil cursive signature script typography on smooth black paper" }
];

export default function ImageShowcaseModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('gallery'); // 'gallery' | 'generator'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [customPrompt, setCustomPrompt] = useState('');
  const [batchCount, setBatchCount] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [copiedPresetId, setCopiedPresetId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  if (!isOpen) return null;

  const categories = ['All', 'Neon', 'Brutalist', '3D', 'Serif', 'Sci-Fi', 'Retro', 'Vintage', 'Minimal', 'Artistic'];

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card showcase-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ gap: '0.55rem' }}>
            <div className="brand-icon" style={{ width: '26px', height: '26px' }}>
              <Wand2 size={14} />
            </div>
            <span>FLUX Image & Typography Showcase</span>
          </div>
          <button className="icon-btn close-modal-btn" onClick={onClose} title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="showcase-nav-tabs">
          <button 
            className={`showcase-tab-btn ${activeTab === 'gallery' ? 'active' : ''}`}
            onClick={() => setActiveTab('gallery')}
          >
            <Layers size={13} />
            <span>Font Presets Gallery (50 Styles)</span>
          </button>
          <button 
            className={`showcase-tab-btn ${activeTab === 'generator' ? 'active' : ''}`}
            onClick={() => setActiveTab('generator')}
          >
            <Sparkles size={13} />
            <span>Batch FLUX Generator</span>
          </button>
        </div>

        {activeTab === 'gallery' && (
          <div className="showcase-body">
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

            <div className="presets-grid">
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
                      title="Generate with FLUX"
                    >
                      <Sparkles size={12} />
                      <span>Generate FLUX</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'generator' && (
          <div className="showcase-body generator-body">
            <div className="generator-input-card">
              <label className="generator-label">Prompt for FLUX.1-schnell:</label>
              <textarea 
                className="generator-textarea"
                rows={3}
                placeholder="Describe the typography style or picture you want to generate with FLUX..."
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
                      <span>Generating FLUX Image(s)...</span>
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
                <ImageIcon size={14} />
                <span>Generated Pictures ({generatedImages.length})</span>
              </h3>

              {generatedImages.length === 0 ? (
                <div className="empty-gallery-state">
                  <Wand2 size={24} style={{ opacity: 0.4 }} />
                  <p>No images generated in this session yet. Select a font preset from the gallery or enter a custom prompt above to create up to 50 FLUX images.</p>
                </div>
              ) : (
                <div className="generated-images-grid">
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
                          download={`flux-image-${img.id}.png`}
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
      </div>

      {previewImage && (
        <div className="image-lightbox-modal" onClick={() => setPreviewImage(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={previewImage} alt="Preview FLUX Image" className="lightbox-img" />
            <button className="icon-btn close-lightbox" onClick={() => setPreviewImage(null)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
