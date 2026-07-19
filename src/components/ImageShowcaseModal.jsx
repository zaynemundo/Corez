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
  { id: 1, name: "Cyberpunk Metropolis", category: "Cyberpunk", prompt: "Cinematic wide shot of a rainy cyberpunk neon metropolis at midnight, volumetric fog, glowing holograms, octane render, 8k resolution" },
  { id: 2, name: "Japandi Living Room", category: "Architecture", prompt: "Sunlit minimalist Japandi living room with floor-to-ceiling windows overlooking a pine forest, brutalist concrete and warm oak wood, hyperrealistic" },
  { id: 3, name: "Obsidian Floating Castle", category: "Fantasy", prompt: "Gothic dark fantasy castle built on a floating obsidian island in a stormy crimson sky, ultra detailed, concept art" },
  { id: 4, name: "Macro Dragonfly Wings", category: "Photorealism", prompt: "Ultra macro photograph of a glowing iridescent dragonfly with dew drops on its wings, soft bokeh background, 100mm lens photorealism" },
  { id: 5, name: "Orbital Space Station", category: "Sci-Fi", prompt: "Massive sleek white starship docking at an orbital ring station above a blue gas giant planet, sci-fi concept art, highly detailed" },
  { id: 6, name: "Liquid Iridescent Sculpture", category: "Product & 3D", prompt: "Fluid liquid metallic iridescent mercury sculpture floating in dark studio lighting, glossy reflections, 3D render" },
  { id: 7, name: "Luxury Perfume Shot", category: "Product & 3D", prompt: "Minimalist luxury perfume glass bottle on dark obsidian stone with water splash droplets, studio softbox lighting, 8k product shot" },
  { id: 8, name: "Isometric Ramen Shop", category: "Product & 3D", prompt: "Isometric 3D diorama of a cozy Japanese ramen shop at night with warm lantern lights and detailed mini street, tilt-shift effect" },
  { id: 9, name: "80s Synthwave Highway", category: "Cyberpunk", prompt: "Retro 1980s synthwave neon grid highway driving towards a massive magenta sun, chrome sports car, 80s aesthetic" },
  { id: 10, name: "Ancient Forest Spirit", category: "Fantasy", prompt: "Ancient mythical forest spirit made of glowing moss and twisted ancient oak branches, dark fantasy concept art" },
  { id: 11, name: "Weathered Sea Captain", category: "Photorealism", prompt: "Close-up portrait of an elderly sea captain with weathered skin, piercing blue eyes, studio Rembrandt lighting, 85mm photo" },
  { id: 12, name: "Bioluminescent Cavern", category: "Landscapes", prompt: "Underwater bioluminescent cave with glowing jellyfish, radiant coral reefs, and crystal clear turquoise water, 8k resolution" },
  { id: 13, name: "Carbon Fiber Cyborg", category: "Sci-Fi", prompt: "Futuristic female cyborg warrior with intricate glowing carbon fiber armor and neon visor, high-tech character portrait" },
  { id: 14, name: "Impressionist Storm Coast", category: "Anime & Art", prompt: "Vibrant impressionist oil painting of a stormy coastline with heavy impasto brushstrokes and dramatic sunset colors" },
  { id: 15, name: "Geometric Wolf Logo", category: "Minimalist", prompt: "Sleek geometric minimalist logo of a wolf head made of sharp thin monochrome lines, vector logo design on dark background" },
  { id: 16, name: "Post-Apocalyptic City", category: "Cyberpunk", prompt: "Overgrown post-apocalyptic city ruins covered in lush green vines under a dramatic cloudy sky, cinematic matte painting" },
  { id: 17, name: "Steampunk Explorer", category: "Sci-Fi", prompt: "Victorian steampunk brass airship soaring through golden sunset clouds, detailed clockwork mechanisms, 8k art" },
  { id: 18, name: "Chibi Anime Wizard", category: "Anime & Art", prompt: "Cute anime chibi wizard character holding a glowing crystal orb, soft pastel colors, detailed digital illustration" },
  { id: 19, name: "Glassmorphism Geometry", category: "Product & 3D", prompt: "Translucent frosted glass floating 3D geometric shapes with pastel ambient light refraction, modern graphic design" },
  { id: 20, name: "Volcanic Lava River", category: "Landscapes", prompt: "Aerial view of rivers of glowing orange molten lava flowing through dark basalt rock, dramatic smoke, nature photography" },
  { id: 21, name: "Low Poly Forest Deer", category: "Minimalist", prompt: "Artistic low poly geometric 3D deer in an enchanted forest with sunbeams breaking through canopy" },
  { id: 22, name: "Film Noir Detective", category: "Photorealism", prompt: "Grainy 35mm vintage film still of a mystery detective standing in atmospheric street lamp fog, noir aesthetic" },
  { id: 23, name: "Pixel Art RPG Town", category: "Anime & Art", prompt: "16-bit pixel art medieval village square with tavern, fountain, and stone houses, detailed retro game graphics" },
  { id: 24, name: "Ink & Smoke Explosion", category: "Anime & Art", prompt: "High-speed photograph of colorful liquid ink and smoke exploding in dark water, macro detail" },
  { id: 25, name: "Cyberpunk Canal Market", category: "Cyberpunk", prompt: "Cyberpunk neon-lit canal market with floating boats, glowing signs, and futuristic street vendors, detailed environment" },
  { id: 26, name: "Nordic Fjord Aurora", category: "Landscapes", prompt: "Breathtaking Nordic fjord under green northern lights aurora borealis, snow-capped mountains, crystal clear water" },
  { id: 27, name: "Robotic Factory Plant", category: "Sci-Fi", prompt: "High-tech automated manufacturing plant with robotic arms assembling futuristic electric vehicle, industrial photography" },
  { id: 28, name: "Layered Paper Mountain", category: "Minimalist", prompt: "Intricate multi-layered paper cutout art of a mountain landscape with deep shadow depth layers" },
  { id: 29, name: "Gold Foil Art Deco", category: "Product & 3D", prompt: "Intricate 1920s Art Deco gold foil geometric pattern on black velvet texture, luxury graphic design" },
  { id: 30, name: "Deep Space Nebula", category: "Sci-Fi", prompt: "Hubble telescope view of a vibrant cosmic star nursery nebula with glowing gas clouds and distant galaxies" },
  { id: 31, name: "Monochrome Staircase", category: "Architecture", prompt: "Stark black and white architectural photograph of curving concrete staircases and shadow play, archdaily style" },
  { id: 32, name: "Emerald Dragon Peak", category: "Fantasy", prompt: "Majestic emerald dragon perched on top of a mountain peak above a sea of clouds, epic fantasy wallpaper" },
  { id: 33, name: "Neon Laser Tunnel", category: "Cyberpunk", prompt: "Infinite perspective cyber tunnel with pulsating red and cyan laser grid beams, high-speed visual" },
  { id: 34, name: "Botanical Orchid Parchment", category: "Anime & Art", prompt: "Detailed 19th-century vintage scientific botanical illustration of exotic orchids on aged parchment" },
  { id: 35, name: "Claymation Kitchen Scene", category: "Product & 3D", prompt: "Handmade 3D claymation plasticine character sitting in a colorful miniature kitchen, clay stop-motion style" },
  { id: 36, name: "Urban Street Graffiti", category: "Anime & Art", prompt: "Vibrant multi-layered urban graffiti mural on a rustic brick wall, spray paint textures and drip details" },
  { id: 37, name: "Vogue Sculptural Dress", category: "Photorealism", prompt: "High fashion avant-garde editorial model wearing dramatic sculptural black dress, studio lighting, Vogue style" },
  { id: 38, name: "Hover Taxi Skyscraper", category: "Sci-Fi", prompt: "Sleek flying hover car soaring between towering futuristic glass skyscrapers at dusk, sci-fi concept art" },
  { id: 39, name: "Zen Rock Garden", category: "Architecture", prompt: "Serene Japanese zen rock garden with raked white gravel patterns and mossy stones, soft morning light" },
  { id: 40, name: "Ocean Lightning Storm", category: "Landscapes", prompt: "Dramatic long-exposure lightning storm striking over a dark ocean, powerful atmospheric photo" },
  { id: 41, name: "Ukiyo-e Ocean Wave", category: "Anime & Art", prompt: "Traditional Japanese Ukiyo-e woodblock print of stormy sea waves with Mt Fuji in background" },
  { id: 42, name: "Retro Synth Arcade", category: "Cyberpunk", prompt: "Interior of a retro-futuristic arcade with glowing arcade cabinets, neon floor reflections, and synth atmosphere" },
  { id: 43, name: "Gold Balloon Dog", category: "Product & 3D", prompt: "Playful glossy metallic gold floating 3D balloon animal sculpture in a clean white gallery space" },
  { id: 44, name: "Desert Palm Oasis", category: "Landscapes", prompt: "Serene desert sand dunes surrounding a pristine palm tree oasis at golden hour, aerial photograph" },
  { id: 45, name: "Gothic Stained Glass", category: "Architecture", prompt: "Intricate gothic cathedral interior with sunlight streaming through colorful stained glass windows casting rainbow light" },
  { id: 46, name: "Floating Sky Islands", category: "Fantasy", prompt: "Surreal fantasy landscape with floating grassy islands connected by rope bridges, waterfalls cascading into clouds" },
  { id: 47, name: "Silicon Microchip Die", category: "Sci-Fi", prompt: "Macro photo of a glowing microchip silicon die processor under microscope lighting, high-tech hardware" },
  { id: 48, name: "Pop Art Hero Panel", category: "Anime & Art", prompt: "1960s pop art comic book panel showing a dramatic superhero expression with halftone dots and bold inks" },
  { id: 49, name: "Curved Glass Tower", category: "Architecture", prompt: "Angle shot looking up at a towering modern glass skyscraper reflecting dramatic sunset sky clouds" },
  { id: 50, name: "Golden Tomb Hieroglyphs", category: "Fantasy", prompt: "Dark ancient Egyptian tomb chamber filled with golden sarcophagus relics and glowing hieroglyphics" }
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card showcase-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ gap: '0.55rem' }}>
            <div className="brand-icon" style={{ width: '26px', height: '26px' }}>
              <Wand2 size={14} />
            </div>
            <span>Creative Prompt Showcase (50 Visual Styles)</span>
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
            <span>Prompt Catalog (50 Visual Styles)</span>
          </button>
          <button 
            className={`showcase-tab-btn ${activeTab === 'generator' ? 'active' : ''}`}
            onClick={() => setActiveTab('generator')}
          >
            <Sparkles size={13} />
            <span>Batch Image Generator</span>
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

        {activeTab === 'generator' && (
          <div className="showcase-body generator-body">
            <div className="generator-input-card">
              <label className="generator-label">Image Prompt:</label>
              <textarea 
                className="generator-textarea"
                rows={3}
                placeholder="Imagine with Corez..."
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
                <ImageIcon size={14} />
                <span>Generated Pictures ({generatedImages.length})</span>
              </h3>

              {generatedImages.length === 0 ? (
                <div className="empty-gallery-state">
                  <Wand2 size={24} style={{ opacity: 0.4 }} />
                  <p>No images generated in this session yet. Select a prompt preset from the catalog or enter a custom prompt above to create up to 50 pictures.</p>
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
