import { useState, useMemo } from 'react';
import {
  Code2,
  File,
  FileJson,
  Globe,
  ChevronRight,
  ChevronDown,
  X,
  ExternalLink,
  FolderClosed,
  FileText,
  Search,
  PanelLeftClose,
  PanelLeft,
  Play
} from 'lucide-react';

const FILE_ICONS = {
  js: Code2,
  jsx: Code2,
  ts: Code2,
  tsx: Code2,
  html: Globe,
  css: FileText,
  json: FileJson,
  md: FileText
};

function getFileIcon(name) {
  const ext = name.split('.').pop();
  return FILE_ICONS[ext] || File;
}

function fileName(name) {
  const ext = name.split('.').pop();
  return FILE_ICONS[ext] ? name : name;
}

const THEME = {
  bg: '#1e1e1e',
  sidebarBg: '#252526',
  activityBarBg: '#333',
  activityBarFg: '#858585',
  activityBarActiveBg: '#1e1e1e',
  tabBg: '#2d2d2d',
  tabActiveBg: '#1e1e1e',
  tabBorder: '#252526',
  editorBg: '#1e1e1e',
  editorFg: '#d4d4d4',
  lineNumberFg: '#858585',
  lineNumberActiveFg: '#c6c6c6',
  statusBarBg: '#007acc',
  statusBarFg: '#fff',
  borderColor: '#3c3c3c',
  folderFg: '#d4d4d4',
  fileFg: '#cccccc',
  selectedBg: '#37373d',
  hoverBg: '#2a2d2e',
  inputBg: '#3c3c3c',
  inputFg: '#cccccc',
  scrollbarBg: '#424242',
  scrollbarHover: '#4f4f4f'
};

const activityBarStyle = {
  width: 48,
  background: THEME.activityBarBg,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: 4,
  gap: 4,
  borderRight: '1px solid ' + THEME.borderColor,
  flexShrink: 0
};

const sidebarStyle = {
  width: 260,
  background: THEME.sidebarBg,
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid ' + THEME.borderColor,
  flexShrink: 0,
  overflow: 'hidden'
};

const sidebarHeaderStyle = {
  padding: '8px 16px',
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#bbb',
  borderBottom: '1px solid ' + THEME.borderColor,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
};

export default function AppStudioPage({ code, title, onClose }) {
  const [selectedFile, setSelectedFile] = useState('App.jsx');
  const [showSidebar, setShowSidebar] = useState(true);

  const files = useMemo(() => {
    const items = [
      { name: 'App.jsx', content: code || '// No code loaded' },
      { name: 'index.html', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>' + (title || 'Corez App') + '</title>\n</head>\n<body>\n  <div id="root"></div>\n</body>\n</html>' },
      { name: 'package.json', content: JSON.stringify({
        name: (title || 'corez-app').toLowerCase().replace(/\s+/g, '-'),
        private: true,
        version: '1.0.0',
        type: 'module',
        scripts: { start: 'vite', build: 'vite build' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' }
      }, null, 2) }
    ];
    if (code && (code.includes('<!DOCTYPE') || code.includes('<html'))) {
      items[0] = { name: 'index.html', content: code };
      items[1] = { name: 'App.jsx', content: '// React component loaded from HTML\n' };
    }
    return items;
  }, [code, title]);

  const currentFile = files.find(f => f.name === selectedFile) || files[0];

  const handleOpenPreview = () => {
    window.open('https://corez.pro', '_blank');
  };

  const editorLines = useMemo(() => {
    return (currentFile?.content || '').split('\n');
  }, [currentFile]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: THEME.bg,
      color: THEME.editorFg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 13,
      overflow: 'hidden'
    }}>
      {/* Main area: activity bar + sidebar + editor */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Activity Bar */}
        <div style={activityBarStyle}>
          <button
            onClick={() => setShowSidebar(prev => !prev)}
            style={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: showSidebar ? THEME.activityBarActiveBg : 'transparent',
              border: 'none',
              borderLeft: showSidebar ? '2px solid #fff' : '2px solid transparent',
              color: showSidebar ? '#fff' : THEME.activityBarFg,
              cursor: 'pointer',
              position: 'relative'
            }}
            title="File Explorer"
          >
            <File size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* Sidebar File Explorer */}
        {showSidebar && (
          <div style={sidebarStyle}>
            <div style={sidebarHeaderStyle}>
              <span>EXPLORER</span>
              <button
                onClick={() => setShowSidebar(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: THEME.activityBarFg,
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex'
                }}
                title="Collapse Sidebar"
              >
                <PanelLeftClose size={14} strokeWidth={1.5} />
              </button>
            </div>

            <div style={{ padding: '4px 0', fontSize: '0.75rem', color: '#bbb', paddingLeft: 8, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronDown size={12} strokeWidth={2} />
              <FolderClosed size={12} strokeWidth={1.5} />
              <span style={{ marginLeft: 2 }}>{title || 'app'}</span>
            </div>

            <div style={{ flex: 1, overflow: 'auto', paddingLeft: 12 }}>
              {files.map((file) => {
                const Icon = getFileIcon(file.name);
                const isSelected = selectedFile === file.name;
                return (
                  <div
                    key={file.name}
                    onClick={() => setSelectedFile(file.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 8px',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      color: THEME.fileFg,
                      background: isSelected ? THEME.selectedBg : 'transparent',
                      borderRadius: 4,
                      marginRight: 8
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = THEME.hoverBg; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Icon size={14} strokeWidth={1.5} style={{ flexShrink: 0, color: isSelected ? '#fff' : '#8a8a8a' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Editor Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            background: THEME.tabBg,
            borderBottom: '1px solid ' + THEME.tabBorder,
            flexShrink: 0,
            overflowX: 'auto'
          }}>
            {files.map((file) => {
              const isActive = selectedFile === file.name;
              const Icon = getFileIcon(file.name);
              return (
                <div
                  key={file.name}
                  onClick={() => setSelectedFile(file.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    color: isActive ? '#fff' : '#999',
                    background: isActive ? THEME.tabActiveBg : THEME.tabBg,
                    borderRight: '1px solid ' + THEME.borderColor,
                    borderTop: isActive ? '1px solid ' + THEME.statusBarBg : '1px solid transparent',
                    whiteSpace: 'nowrap',
                    userSelect: 'none'
                  }}
                >
                  <Icon size={12} strokeWidth={1.5} />
                  <span>{file.name}</span>
                </div>
              );
            })}
          </div>

          {/* Editor Content */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            background: THEME.editorBg,
            display: 'flex',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              {/* Line Numbers */}
              <div style={{
                textAlign: 'right',
                padding: '8px 0',
                paddingRight: 8,
                minWidth: 48,
                userSelect: 'none',
                color: THEME.lineNumberFg,
                fontSize: '0.8125rem',
                lineHeight: 1.6,
                fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", "Courier New", monospace',
                borderRight: '1px solid ' + THEME.borderColor,
                background: THEME.editorBg
              }}>
                {editorLines.map((_, i) => (
                  <div key={i} style={{ paddingRight: 4 }}>{i + 1}</div>
                ))}
              </div>

              {/* Code */}
              <pre style={{
                flex: 1,
                margin: 0,
                padding: '8px 16px',
                fontSize: '0.8125rem',
                lineHeight: 1.6,
                fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", "Courier New", monospace',
                color: THEME.editorFg,
                background: 'transparent',
                overflow: 'auto',
                whiteSpace: 'pre',
                tabSize: 2
              }}>
                {currentFile?.content || ''}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        height: 24,
        background: THEME.statusBarBg,
        color: THEME.statusBarFg,
        fontSize: '0.6875rem',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Code2 size={11} strokeWidth={1.5} />
            {title || 'Untitled App'}
          </span>
          <span>Ln {editorLines.length}, Col {currentFile?.content?.split('\n').pop()?.length || 0}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>UTF-8</span>
          <span>JavaScript JSX</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ExternalLink size={11} strokeWidth={1.5} />
            Prettier
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: THEME.statusBarFg,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            borderRadius: 3,
            fontSize: '0.6875rem',
            opacity: 0.8
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
        >
          <X size={12} strokeWidth={1.5} />
          Close Studio
        </button>
      </div>
    </div>
  );
}
