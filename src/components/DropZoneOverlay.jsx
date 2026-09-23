import {
  UploadCloud,
  FileCode2,
  Image,
  FileText,
  Sparkles,
} from "lucide-react";
import { useI18n } from "../i18n/index.jsx";

export default function DropZoneOverlay({
  isDragging,
  onDrop,
  onDragLeave,
  onDragOver,
}) {
  const { t } = useI18n();
  if (!isDragging) return null;

  return (
    <div
      className="file-drop-overlay"
      role="region"
      aria-label={t("chat.composer.dropZone.label")}
      aria-live="polite"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="file-drop-card">
        <div className="file-drop-icon-wrapper">
          <UploadCloud
            size={38}
            strokeWidth={1.75}
            className="file-drop-icon"
          />
        </div>
        <h2 className="file-drop-title">
          {t("chat.composer.dropZone.title")}
        </h2>
        <p className="file-drop-subtitle">
          {t("chat.composer.dropZone.subtitle")}
        </p>

        <div className="file-drop-types">
          <span className="file-drop-type-pill">
            <FileCode2 size={13} strokeWidth={1.75} />
            <span>{t("chat.composer.dropZone.typeCode")}</span>
          </span>
          <span className="file-drop-type-pill">
            <Image size={13} strokeWidth={1.75} />
            <span>{t("chat.composer.dropZone.typeImages")}</span>
          </span>
          <span className="file-drop-type-pill">
            <FileText size={13} strokeWidth={1.75} />
            <span>{t("chat.composer.dropZone.typeText")}</span>
          </span>
          <span className="file-drop-type-pill">
            <Sparkles size={13} strokeWidth={1.75} />
            <span>{t("chat.composer.dropZone.typeAny")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
