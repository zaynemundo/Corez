// Public Android download page and APK streaming.
//
// `GET /download` serves a small landing page with install instructions;
// `GET /download/corez.apk` streams the current sideload APK straight out of R2
// so the link stays stable while the object is replaced on each build. No auth:
// a download link has to work for someone who has not installed the app yet.

const APK_KEY = "downloads/corez.apk";
const APK_FILE_NAME = "CoreZ-0.1.0.apk";
const APK_VERSION = "0.1.0";

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return "–";
  const mb = value / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadPage({ available, size }) {
  const button = available
    ? `<a class="download" href="/download/corez.apk">Download APK</a>`
    : `<span class="download disabled">Build is being uploaded…</span>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CoreZ for Android — Download</title>
<meta name="description" content="Download the CoreZ Android app." />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0a0a0a; color: #f5f5f5; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card { width: 100%; max-width: 440px; border: 1px solid #2a2a2a; border-radius: 20px; background: #111; padding: 28px; }
  .logo { width: 56px; height: 56px; display: block; margin: 0 auto 18px; }
  h1 { font-size: 26px; line-height: 1.2; text-align: center; margin: 0 0 6px; letter-spacing: -0.02em; }
  .sub { text-align: center; color: #a3a3a3; font-size: 13.5px; line-height: 1.5; margin: 0 0 22px; }
  .meta { display: flex; justify-content: center; gap: 8px; margin-bottom: 22px; flex-wrap: wrap; }
  .pill { border: 1px solid #2a2a2a; border-radius: 999px; padding: 5px 11px; font-size: 11.5px; color: #a3a3a3; }
  .download {
    display: block; text-align: center; text-decoration: none; background: #f5f5f5; color: #0a0a0a;
    font-weight: 700; font-size: 15px; border-radius: 12px; padding: 14px 18px; margin-bottom: 22px;
  }
  .download.disabled { background: #262626; color: #a3a3a3; font-weight: 600; }
  .steps { margin: 0; padding: 0; list-style: none; display: grid; gap: 12px; }
  .steps li { display: flex; gap: 10px; font-size: 13px; line-height: 1.5; color: #d4d4d4; }
  .num { flex: 0 0 22px; width: 22px; height: 22px; border-radius: 11px; background: #1f1f1f; color: #f5f5f5; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
  .note { margin: 22px 0 0; font-size: 11.5px; line-height: 1.55; color: #737373; border-top: 1px solid #1f1f1f; padding-top: 16px; }
  a.plain { color: #d4d4d4; }
</style>
</head>
<body>
  <main class="card">
    <img class="logo" src="/corez-white.png" alt="CoreZ" />
    <h1>CoreZ for Android</h1>
    <p class="sub">The native CoreZ app — chat, build, publish and manage your sites.</p>
    <div class="meta">
      <span class="pill">Version ${escapeHtml(APK_VERSION)}</span>
      <span class="pill">${escapeHtml(formatBytes(size))}</span>
      <span class="pill">Android 8.0+</span>
    </div>
    ${button}
    <ol class="steps">
      <li><span class="num">1</span><span>Tap <strong>Download APK</strong> and wait for the file to finish downloading.</span></li>
      <li><span class="num">2</span><span>Open it and allow <strong>Install unknown apps</strong> for your browser or Files app when Android asks.</span></li>
      <li><span class="num">3</span><span>Open CoreZ and sign in with your account — or create one in the app.</span></li>
    </ol>
    <p class="note">Sideload test build, signed with the development key. Updates install over it without losing your session. By installing you agree to the <a class="plain" href="/terms">Terms</a> and <a class="plain" href="/privacy">Privacy Policy</a>.</p>
  </main>
</body>
</html>`;
}

async function loadApkHead(env) {
  if (
    !env?.ASSET_BUCKET ||
    typeof env.ASSET_BUCKET.get !== "function" ||
    typeof env.ASSET_BUCKET.head !== "function"
  ) {
    return { available: false, size: 0, object: null };
  }
  try {
    const object = await env.ASSET_BUCKET.head(APK_KEY).catch(() => null);
    return { available: Boolean(object), size: object?.size || 0, object };
  } catch {
    return { available: false, size: 0, object: null };
  }
}

export async function handleDownload(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  if (pathname === "/download" || pathname === "/download/") {
    const { available, size } = await loadApkHead(env);
    return new Response(downloadPage({ available, size }), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
      },
    });
  }

  if (pathname !== "/download/corez.apk" && pathname !== "/download/apk") {
    return new Response("Not found", { status: 404 });
  }

  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.get !== "function") {
    return new Response("The Android build is not available yet.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const rangeHeader = request.headers.get("range");
  const object = await env.ASSET_BUCKET
    .get(APK_KEY, rangeHeader ? { range: request.headers } : undefined)
    .catch(() => null);
  if (!object) {
    return new Response("The Android build is not available yet.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const headers = new Headers({
    "content-type": "application/vnd.android.package-archive",
    "content-disposition": `attachment; filename="${APK_FILE_NAME}"`,
    "cache-control": "public, max-age=300",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
  });
  if (object.httpEtag) headers.set("etag", object.httpEtag);

  let status = 200;
  let body = request.method === "HEAD" ? null : object.body;
  if (object.range && typeof object.range === "object") {
    const start = Number(object.range.offset) || 0;
    const length =
      Number(object.range.length) > 0
        ? Number(object.range.length)
        : Math.max(0, object.size - start);
    status = 206;
    headers.set(
      "content-range",
      `bytes ${start}-${start + length - 1}/${object.size}`,
    );
    headers.set("content-length", String(length));
  } else {
    headers.set("content-length", String(object.size));
  }

  return new Response(body, { status, headers });
}
