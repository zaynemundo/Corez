import { useEffect, useState } from "react";
import { Play, ShieldCheck } from "lucide-react";
import {
  EMBED_SANDBOX,
  isAllowedEmbedSrc,
  resolveEmbed,
} from "../utils/embedHosts";
import {
  hasConsent,
  readConsent,
  saveConsent,
  subscribeConsent,
} from "../services/consentService";
import { track } from "../services/analytics";
import { useI18n } from "../i18n/index.jsx";

// Click-to-load third-party embed.
//
// Until the visitor allows the "embeds" category, the third party is never
// contacted: no iframe, no poster image fetched from their CDN, no cookies.
// Once loaded, the iframe is sandboxed (no top navigation), referrer-restricted
// and lazy-loaded. The provider URL is rebuilt by embedHosts from a validated
// id, so tracking parameters in the original link are dropped.
export default function SafeEmbed({
  url,
  title,
  aspect = "16 / 9",
  className = "",
  forceLoad = false,
}) {
  const resolved = resolveEmbed(url);
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(
    () => Boolean(forceLoad) || hasConsent("embeds"),
  );

  // Consent can change in the banner, the preferences dialog or another tab;
  // a withdrawn consent must unload the frame on the next render.
  useEffect(() => {
    if (forceLoad) {
      setLoaded(true);
      return undefined;
    }
    const sync = () => setLoaded(hasConsent("embeds"));
    sync();
    return subscribeConsent(sync);
  }, [forceLoad]);


  if (!resolved || !isAllowedEmbedSrc(resolved.src)) {
    return (
      <div className={`safe-embed safe-embed--unsupported ${className}`.trim()}>
        <p className="safe-embed-unsupported">
          <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
          {t("common.embed.notAllowed")}
        </p>
      </div>
    );
  }

  const loadEmbed = () => {
    track("embed_loaded", { provider: resolved.provider });
    setLoaded(true);
  };

  const allowAllEmbeds = () => {
    const current = readConsent()?.categories || {};
    saveConsent({ ...current, embeds: true }, { source: "embed_placeholder" });
    loadEmbed();
  };

  return (
    <div
      className={`safe-embed ${loaded ? "is-loaded" : "is-blocked"} ${className}`.trim()}
      style={{ aspectRatio: aspect }}
    >
      {loaded ? (
        <iframe
          className="safe-embed-frame"
          src={resolved.src}
          title={title}
          loading="lazy"
          sandbox={EMBED_SANDBOX}
          referrerPolicy="strict-origin-when-cross-origin"
          allow={resolved.allow || undefined}
          allowFullScreen
        />
      ) : (
        <div className="safe-embed-placeholder" role="group" aria-label={title}>
          <ShieldCheck size={22} strokeWidth={1.5} aria-hidden="true" />
          <p className="safe-embed-title">{title}</p>
          <p className="safe-embed-copy">
            {t("common.embed.cookieNotice", { provider: resolved.label })}
          </p>
          <div className="safe-embed-actions">
            <button
              type="button"
              className="consent-btn consent-btn-solid"
              onClick={loadEmbed}
            >
              <Play size={14} strokeWidth={1.75} aria-hidden="true" />
              {t("common.embed.load")}
            </button>
            <button
              type="button"
              className="consent-btn consent-btn-ghost"
              onClick={allowAllEmbeds}
            >
              {t("common.embed.alwaysAllow")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
