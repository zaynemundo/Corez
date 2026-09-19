// Allowlist for third-party embeds.
//
// Nothing here trusts caller input: a URL is parsed, its host must match a
// known provider exactly, the scheme must be https, and the final embed URL is
// rebuilt from scratch from a validated id — the original query string is never
// forwarded, so tracking parameters cannot ride along. Anything that does not
// resolve comes back as null and the caller must render a plain fallback.

export const EMBED_SANDBOX =
  "allow-scripts allow-same-origin allow-presentation allow-popups";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^[0-9]{5,12}$/;
const MAPS_PB = /^[A-Za-z0-9!_.~*'()%-]{1,600}$/;

const PROVIDERS = {
  youtube: {
    label: "YouTube",
    allow:
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    hosts: new Set([
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
      "youtu.be",
      "www.youtu.be",
    ]),
  },
  vimeo: {
    label: "Vimeo",
    allow: "autoplay; fullscreen; picture-in-picture",
    hosts: new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]),
  },
  maps: {
    label: "Google Maps",
    allow: "",
    hosts: new Set(["google.com", "www.google.com", "maps.google.com"]),
  },
};

function parseUrl(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  // Reject control characters and whitespace-embedded schemes outright.
  for (let index = 0; index < trimmed.length; index += 1) {
    const code = trimmed.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f || code === 0x20) return null;
  }
  if (!/^https:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function providerForHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    if (provider.hosts.has(host)) return id;
  }
  return null;
}

function startSeconds(url) {
  const raw = url.searchParams.get("t") || url.searchParams.get("start");
  if (!raw) return null;
  const match = String(raw).match(/^(\d{1,6})s?$/);
  if (!match) return null;
  return Number(match[1]);
}

function youtubeEmbed(url) {
  let id = "";
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be" || host === "www.youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v") || "";
  } else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") {
      id = parts[1] || "";
    }
  }
  if (!YOUTUBE_ID.test(id)) return null;
  const start = startSeconds(url);
  // youtube-nocookie.com is YouTube's privacy-enhanced mode: no advertising
  // cookies are set until playback starts.
  const src = `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ""}`;
  return { provider: "youtube", src };
}

function vimeoEmbed(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const candidate = parts[0] === "video" ? parts[1] : parts[0];
  const id = String(candidate || "").replace(/[^0-9]/g, "");
  if (!VIMEO_ID.test(id)) return null;
  return { provider: "vimeo", src: `https://player.vimeo.com/video/${id}?dnt=1` };
}

function mapsEmbed(url) {
  const embedPath = url.pathname.toLowerCase();
  const isEmbedEndpoint = embedPath.includes("/maps/embed");
  const isLegacyEmbed =
    url.searchParams.get("output") === "embed" || url.searchParams.get("pb");
  if (!isEmbedEndpoint && !isLegacyEmbed) return null;

  const pb = url.searchParams.get("pb");
  if (pb) {
    if (!MAPS_PB.test(pb)) return null;
    return {
      provider: "maps",
      src: `https://www.google.com/maps/embed?pb=${encodeURIComponent(pb)}`,
    };
  }

  const q = url.searchParams.get("q");
  if (q && q.length <= 200 && !/[<>"']/.test(q)) {
    return {
      provider: "maps",
      src: `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`,
    };
  }
  return null;
}

const BUILDERS = {
  youtube: youtubeEmbed,
  vimeo: vimeoEmbed,
  maps: mapsEmbed,
};

/**
 * Resolve a third-party URL into a privacy-preserving embed specification.
 * @returns {{provider: string, label: string, src: string, allow: string}} | null
 */
export function resolveEmbed(rawUrl) {
  const url = parseUrl(rawUrl);
  if (!url) return null;
  const provider = providerForHost(url.hostname);
  if (!provider) return null;
  const built = BUILDERS[provider](url);
  if (!built) return null;
  return {
    provider,
    label: PROVIDERS[provider].label,
    src: built.src,
    allow: PROVIDERS[provider].allow,
  };
}

/** Guard used immediately before rendering an iframe src. */
export function isAllowedEmbedSrc(src) {
  // Exactly as strict as the renderer: a URL that cannot be rebuilt into a
  // provider embed (wrong scheme, unlisted host, invalid id, junk query) is not
  // allowed to become an iframe src.
  return resolveEmbed(src) !== null;
}

export const EMBED_PROVIDER_LABELS = Object.fromEntries(
  Object.entries(PROVIDERS).map(([id, provider]) => [id, provider.label]),
);
