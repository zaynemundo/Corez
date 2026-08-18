import { UploadCloud, FileCode2, Image, FileText, Sparkles } from 'lucide-react';

export default function DropZoneOverlay({ isDragging, onDrop, onDragLeave, onDragOver }) {
  if (!isDragging) return null;

  return (
    <div
      className="file-drop-overlay"
      role="region"
      aria-label="Drop files here to attach"
      aria-live="polite"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="file-drop-card">
        <div className="file-drop-icon-wrapper">
          <UploadCloud size={38} strokeWidth={1.75} className="file-drop-icon" />
        </div>
        <h2 className="file-drop-title">Drop any file here</h2>
        <p className="file-drop-subtitle">
          Attach code, images, documents, or data directly to your conversation
        </p>

        <div className="file-drop-types">
          <span className="file-drop-type-pill">
            <FileCode2 size={13} strokeWidth={1.75} />
            <span>Code (.js, .py, .html, .css...)</span>
          </span>
          <span className="file-drop-type-pill">
            <Image size={13} strokeWidth={1.75} />
            <span>Images (.png, .jpg, .svg...)</span>
          </span>
          <span className="file-drop-type-pill">
            <FileText size={13} strokeWidth={1.75} />
            <span>Text (.md, .json, .csv...)</span>
          </span>
          <span className="file-drop-type-pill">
            <Sparkles size={13} strokeWidth={1.75} />
            <span>Any file</span>
          </span>
        </div>
      </div>
    </div>
  );
}
