import { useState } from 'react';
import {
  Puzzle,
  Store,
  PlusCircle,
  Check,
  Power,
  X,
  ShieldCheck,
  Trash2,
  Play,
  Search,
  CheckCircle2
} from 'lucide-react';
import {
  getPlugins,
  togglePlugin,
  registerCustomPlugin,
  uninstallPlugin
} from '../services/pluginService.js';

export default function PluginStoreModal({
  isOpen,
  onClose,
  onLaunchCanvasPlugin
}) {
  const [activeTab, setActiveTab] = useState('installed'); // 'installed' | 'marketplace' | 'developer'
  const [plugins, setPlugins] = useState(() => getPlugins());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Developer Studio form state
  const [devName, setDevName] = useState('');
  const [devDesc, setDevDesc] = useState('');
  const [devCategory, setDevCategory] = useState('tools');
  const [devType, setDevType] = useState('sandboxed-widget');
  const [devCode, setDevCode] = useState(`<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: white; padding: 20px; text-align: center; }
    button { padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
  </style>
</head>
<body>
  <h3>🚀 My Custom Widget</h3>
  <button onclick="alert('Hello from custom plugin!')">Click Me</button>
</body>
</html>`);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(false);

  if (!isOpen) return null;

  const handleToggle = (id) => {
    const updated = togglePlugin(id);
    setPlugins(updated);
  };

  const handleUninstall = (id) => {
    const updated = uninstallPlugin(id);
    setPlugins(updated);
  };

  const handleCreateCustomPlugin = (e) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);

    try {
      registerCustomPlugin({
        name: devName,
        description: devDesc,
        category: devCategory,
        type: devType,
        code: devCode
      });
      setPlugins(getPlugins());
      setFormSuccess(true);
      setDevName('');
      setDevDesc('');
      setTimeout(() => {
        setFormSuccess(false);
        setActiveTab('installed');
      }, 1200);
    } catch (err) {
      setFormError(err.message || 'Failed to create plugin.');
    }
  };

  const filteredPlugins = plugins.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const installedPlugins = plugins.filter((p) => p.enabled);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content plugin-store-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <Puzzle size={22} className="modal-title-icon" />
            <div>
              <h2>Corez Plugin Ecosystem</h2>
              <p className="modal-subtitle">Extend website capabilities with tools, interactive canvas widgets, and AI tools.</p>
            </div>
          </div>
          <button className="icon-btn modal-close-btn" onClick={onClose} title="Close Plugin Store">
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="plugin-tabs">
          <button
            className={`plugin-tab-btn ${activeTab === 'installed' ? 'active' : ''}`}
            onClick={() => setActiveTab('installed')}
          >
            <ShieldCheck size={16} />
            <span>Installed ({installedPlugins.length})</span>
          </button>
          <button
            className={`plugin-tab-btn ${activeTab === 'marketplace' ? 'active' : ''}`}
            onClick={() => setActiveTab('marketplace')}
          >
            <Store size={16} />
            <span>Marketplace</span>
          </button>
          <button
            className={`plugin-tab-btn ${activeTab === 'developer' ? 'active' : ''}`}
            onClick={() => setActiveTab('developer')}
          >
            <PlusCircle size={16} />
            <span>Developer Studio</span>
          </button>
        </div>

        {/* Tab 1: Installed Plugins */}
        {activeTab === 'installed' && (
          <div className="plugin-tab-content">
            <div className="plugin-list-grid">
              {plugins.map((plugin) => (
                <div key={plugin.id} className={`plugin-card ${plugin.enabled ? 'enabled' : 'disabled'}`}>
                  <div className="plugin-card-header">
                    <div className="plugin-info">
                      <span className="plugin-type-badge">{plugin.type}</span>
                      <h3 className="plugin-name">{plugin.name}</h3>
                      <span className="plugin-author">v{plugin.version} • {plugin.author}</span>
                    </div>
                    <div className="plugin-card-actions">
                      {plugin.type === 'sandboxed-widget' && plugin.code && onLaunchCanvasPlugin && (
                        <button
                          className="btn-secondary plugin-launch-btn"
                          onClick={() => {
                            onLaunchCanvasPlugin(plugin);
                            onClose();
                          }}
                          title="Preview canvas widget"
                        >
                          <Play size={14} />
                          <span>Launch</span>
                        </button>
                      )}
                      <button
                        className={`plugin-toggle-btn ${plugin.enabled ? 'on' : 'off'}`}
                        onClick={() => handleToggle(plugin.id)}
                        aria-label={plugin.enabled ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
                      >
                        <Power size={14} />
                        <span>{plugin.enabled ? 'Enabled' : 'Disabled'}</span>
                      </button>
                      {plugin.id.startsWith('custom-') && (
                        <button
                          className="icon-btn danger-btn"
                          onClick={() => handleUninstall(plugin.id)}
                          title="Uninstall custom plugin"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="plugin-description">{plugin.description}</p>
                  {plugin.permissions && plugin.permissions.length > 0 && (
                    <div className="plugin-permissions">
                      <ShieldCheck size={12} />
                      <span>Permissions: {plugin.permissions.join(', ')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Plugin Marketplace */}
        {activeTab === 'marketplace' && (
          <div className="plugin-tab-content">
            <div className="marketplace-toolbar">
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search plugins..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="category-filters">
                {['all', 'tools', 'data', 'design', 'productivity'].map((cat) => (
                  <button
                    key={cat}
                    className={`category-pill ${categoryFilter === cat ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="plugin-list-grid">
              {filteredPlugins.map((plugin) => (
                <div key={plugin.id} className="plugin-card marketplace-card">
                  <div className="plugin-card-header">
                    <div>
                      <span className="plugin-type-badge">{plugin.category}</span>
                      <h3 className="plugin-name">{plugin.name}</h3>
                      <span className="plugin-author">By {plugin.author}</span>
                    </div>
                    <button
                      className={`plugin-action-btn ${plugin.enabled ? 'installed' : 'install'}`}
                      onClick={() => handleToggle(plugin.id)}
                    >
                      {plugin.enabled ? <Check size={14} /> : <PlusCircle size={14} />}
                      <span>{plugin.enabled ? 'Installed' : 'Install'}</span>
                    </button>
                  </div>
                  <p className="plugin-description">{plugin.description}</p>
                </div>
              ))}
              {filteredPlugins.length === 0 && (
                <div className="empty-plugins-notice">
                  <p>No matching plugins found for "{searchQuery}".</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Developer Studio */}
        {activeTab === 'developer' && (
          <div className="plugin-tab-content">
            <form className="developer-studio-form" onSubmit={handleCreateCustomPlugin}>
              <h3>Create Custom Plugin</h3>
              <p className="form-help">Design and register your own HTML/JS sandboxed widget or AI tool payload.</p>

              {formError && <div className="form-alert error">{formError}</div>}
              {formSuccess && (
                <div className="form-alert success">
                  <CheckCircle2 size={16} /> Plugin registered successfully!
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Plugin Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. My Custom Calculator"
                    value={devName}
                    onChange={(e) => setDevName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select value={devCategory} onChange={(e) => setDevCategory(e.target.value)}>
                    <option value="tools">Tools</option>
                    <option value="data">Data</option>
                    <option value="design">Design</option>
                    <option value="productivity">Productivity</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Plugin Type</label>
                  <select value={devType} onChange={(e) => setDevType(e.target.value)}>
                    <option value="sandboxed-widget">Sandboxed Widget</option>
                    <option value="ai-tool">AI Tool Extension</option>
                    <option value="client-extension">Client Extension</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Short Description</label>
                <input
                  type="text"
                  placeholder="Describe what your plugin does..."
                  value={devDesc}
                  onChange={(e) => setDevDesc(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>HTML / JavaScript Payload (Sandboxed)</label>
                <textarea
                  className="code-textarea"
                  rows={8}
                  value={devCode}
                  onChange={(e) => setDevCode(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-primary form-submit-btn">
                <PlusCircle size={16} />
                <span>Register Custom Plugin</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
