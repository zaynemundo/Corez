import {
  extractDataSeriesNumbers,
  calcStats,
  calcLinearTrend,
  round2,
} from "./skillVerification.js";

// Fix common JS syntax errors introduced when model copies large base64 data URLs
// (e.g. missing * in particle system: Math.random()canvas.width -> Math.random()*canvas.width)
export function fixCommonJSInHtml(html) {
  if (typeof html !== "string" || !html.includes("<script")) return html;
  return (
    html
      // Particle system: Math.random()canvas.width → Math.random()*canvas.width
      .replace(
        /Math\.random\(\)\s*canvas\.width/g,
        "Math.random()*canvas.width",
      )
      .replace(
        /Math\.random\(\)\s*canvas\.height/g,
        "Math.random()*canvas.height",
      )
      .replace(/Math\.random\(\)\s*2/g, "Math.random()*2")
      .replace(
        /\(Math\.random\(\)\s*-\s*0\.5\)\s*0\.3/g,
        "(Math.random()-0.5)*0.3",
      )
      .replace(
        /\(Math\.random\(\)\s*-\s*0\.5\)\s*0\.3/g,
        "(Math.random()-0.5)*0.3",
      )
      // rgba with template literal inside string (missing backticks)
      .replace(/ctx\.fillStyle\s*=\s*rgba\(/g, "ctx.fillStyle=`rgba(")
      .replace(/\$\{this\.opacity\}\)\s*;/g, "${this.opacity})`;")
      // Fix missing * in other common patterns: 0.05(1-... ) → 0.05*(1-... )
      .replace(/0\.05\s*\(/g, "0.05*(")
      .replace(/0\.08\s*\(/g, "0.08*(")
      // Fix canvas.width/height missing * in other places
      .replace(
        /Math\.random\(\)\s*([a-zA-Z_][a-zA-Z0-9_]*\.width)/g,
        "Math.random()*$1",
      )
      .replace(
        /Math\.random\(\)\s*([a-zA-Z_][a-zA-Z0-9_]*\.height)/g,
        "Math.random()*$1",
      )
  );
}

// Safety-net: if the model still emits a local filename (e.g. 1716041183016.jpg, avatar.jpg)
// or a generic Unsplash placeholder (https://images.unsplash.com/...) instead
// of using the user's attached image, replace it with the attached image.
export function patchLocalImageSrc(html, messages) {
  if (typeof html !== "string" || !html.includes("<img")) return html;
  const urls = [];
  let promptText = "";
  for (const m of Array.isArray(messages) ? messages : []) {
    if (typeof m?.content === "string")
      promptText += " " + m.content.toLowerCase();
    else if (Array.isArray(m?.content)) {
      for (const c of m.content)
        if (c?.text) promptText += " " + String(c.text).toLowerCase();
    }
    for (const a of Array.isArray(m?.attachments) ? m.attachments : []) {
      if (
        typeof a?.assetUrl === "string" &&
        String(a.assetUrl).includes("/api/assets/")
      ) {
        const abs = String(a.assetUrl).startsWith("http")
          ? String(a.assetUrl)
          : `https://corez.pro${String(a.assetUrl).startsWith("/") ? "" : "/"}${String(a.assetUrl)}`;
        urls.push(abs);
      } else if (
        typeof a?.thumb === "string" &&
        a.thumb.startsWith("data:image/")
      )
        urls.push(a.thumb);
    }
  }
  if (urls.length === 0) return html;
  const mentionsChangeImage =
    /change\s+(the\s+)?image|add\s+this\s+image|replace\s+.*image|use\s+this\s+(image|photo|picture|portrait|avatar)/i.test(
      promptText,
    );
  const shouldPatchUnsplash = mentionsChangeImage;
  const isPlaceholderUrl = (src) =>
    /unsplash\.com|picsum\.photos|placehold\.|via\.placeholder|dummyimage|placeholder\.com/i.test(
      src,
    );

  let patched = html;
  let urlIndex = 0;

  if (shouldPatchUnsplash) {
    let replacedPrimary = false;
    patched = patched.replace(/<img\s+[^>]*>/gi, (match) => {
      if (replacedPrimary || urlIndex >= urls.length) return match;
      const altMatch = match.match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1].toLowerCase() : "";
      const srcMatch = match.match(/src=["']([^"']+)["']/i);
      const src = srcMatch ? srcMatch[1] : "";
      const isPortraitAlt =
        /(portrait|avatar|profile|headshot|photo)/i.test(alt) ||
        /(portrait|avatar|profile|headshot)/i.test(match.toLowerCase());
      const idx = patched.indexOf(match);
      const context = patched
        .slice(Math.max(0, idx - 500), idx + 500)
        .toLowerCase();
      const nearbyPortrait = /(portrait|avatar|profile|headshot)/i.test(
        context,
      );
      const isPlaceholder = isPlaceholderUrl(src);
      const isLocalFile =
        src &&
        !src.startsWith("data:") &&
        !src.startsWith("/api/") &&
        !src.startsWith("http");
      if (isPortraitAlt || nearbyPortrait || isPlaceholder || isLocalFile) {
        const isCorrectUrl = urls.includes(src);
        if (isCorrectUrl) return match;
        if (src) {
          const replacement = urls[urlIndex++];
          replacedPrimary = true;
          let newTag = match.replace(src, replacement);
          newTag = newTag.replace(/\s*display\s*:\s*none\s*;?/gi, "");
          newTag = newTag.replace(/style=["']\s*["']/i, "");
          newTag = newTag.replace(/style=["']\s*;\s*["']/i, 'style=""');
          if (!/onerror/i.test(newTag)) {
            newTag = newTag.replace(
              /<img/i,
              "<img onerror=\"this.onerror=null;this.style.display='none';const p=this.nextElementSibling;if(p&&p.classList.contains('image-fallback'))p.style.display='block'\"",
            );
          }
          if (!/alt=/i.test(newTag) || /alt=["']\s*["']/i.test(newTag)) {
            newTag = newTag.replace(
              /alt=["'][^"']*["']/i,
              'alt="User portrait"',
            );
            if (!/alt=/i.test(newTag))
              newTag = newTag.replace(/<img/i, '<img alt="User portrait"');
          }
          if (!/object-fit/i.test(newTag)) {
            newTag = newTag.replace(/style=["']/i, 'style="object-fit:cover;');
            if (!/style=/i.test(newTag))
              newTag = newTag.replace(
                /<img/i,
                '<img style="width:100%;height:100%;object-fit:cover"',
              );
          }
          return newTag;
        }
      }
      return match;
    });
    if (replacedPrimary) return patched;
  }

  patched = patched.replace(
    /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi,
    (match, src) => {
      const isData = src.startsWith("data:");
      const isApi = src.startsWith("/api/");
      const isHttps = src.startsWith("https://") || src.startsWith("http://");
      const isPlaceholder = isPlaceholderUrl(src);
      const isHallucinatedR2 = isApi && !urls.includes(src);
      if (urls.includes(src)) return match;
      if (isData) return match;
      if (isHallucinatedR2 && urlIndex < urls.length) {
        const replacement = urls[urlIndex++];
        let newTag = match.replace(src, replacement);
        newTag = newTag.replace(/\s*display\s*:\s*none\s*;?/gi, "");
        newTag = newTag.replace(/style=["']\s*["']/i, "");
        if (!/onerror/i.test(newTag)) {
          newTag = newTag.replace(
            /<img/i,
            "<img onerror=\"this.onerror=null;this.style.display='none';const p=this.nextElementSibling;if(p&&p.classList.contains('image-fallback'))p.style.display='block'\"",
          );
        }
        if (!/alt=/i.test(newTag)) {
          newTag = newTag.replace(/<img/i, '<img alt="Attached image"');
        }
        return newTag;
      }
      if (isApi) return match;
      if (isHttps && !isPlaceholder && !shouldPatchUnsplash) return match;
      if (
        isHttps &&
        isPlaceholder &&
        shouldPatchUnsplash &&
        urlIndex < urls.length
      ) {
        const replacement = urls[urlIndex++];
        let newTag = match.replace(src, replacement);
        newTag = newTag.replace(/\s*display\s*:\s*none\s*;?/gi, "");
        if (!/onerror/i.test(newTag)) {
          newTag = newTag.replace(
            /<img/i,
            "<img onerror=\"this.onerror=null;this.style.display='none';const p=this.nextElementSibling;if(p&&p.classList.contains('image-fallback'))p.style.display='block'\"",
          );
        }
        if (!/alt=/i.test(newTag)) {
          newTag = newTag.replace(/<img/i, '<img alt="Attached image"');
        }
        return newTag;
      }
      if (!isHttps && !isData && !isApi) {
        if (urlIndex < urls.length) {
          const replacement = urls[urlIndex++];
          let newTag = match.replace(src, replacement);
          newTag = newTag.replace(/\s*display\s*:\s*none\s*;?/gi, "");
          if (!/onerror/i.test(newTag)) {
            newTag = newTag.replace(
              /<img/i,
              "<img onerror=\"this.onerror=null;this.style.display='none';const p=this.nextElementSibling;if(p&&p.classList.contains('image-fallback'))p.style.display='block'\"",
            );
          }
          if (!/alt=/i.test(newTag)) {
            newTag = newTag.replace(/<img/i, '<img alt="Attached image"');
          }
          return newTag;
        }
      }
      return match;
    },
  );
  return patched;
}

export function buildLiveDataDiagnostics(
  liveDataEvidence,
  liveDataNeed,
  verification,
) {
  if (!liveDataEvidence) {
    return liveDataNeed.required
      ? {
          liveDataRequired: true,
          searchFetched: false,
          liveDataUsed: false,
          answerGrounded: false,
          liveDataNeed: liveDataNeed.kind,
        }
      : null;
  }

  const results = Array.isArray(verification?.results)
    ? verification.results
    : [];
  const liveResult = results.find(
    (result) => result.skillId === "live-data-utilities",
  );
  const researchResult = results.find(
    (result) => result.skillId === "research-report",
  );
  const honestRefusal = Boolean(liveResult?.evidence?.honestRefusal);
  const answerGrounded = liveResult
    ? Boolean(
        liveResult.evidence?.liveDataUsed && liveResult.failures?.length === 0,
      )
    : researchResult
      ? Boolean(
          researchResult.evidence?.groundingValid &&
          researchResult.failures?.length === 0,
        )
      : false;

  return {
    liveDataRequired: liveDataNeed.required || false,
    searchFetched: true,
    liveDataUsed: answerGrounded,
    answerGrounded,
    honestRefusal,
    dataSource: liveDataEvidence.sources,
    fetchedAt: liveDataEvidence.fetchedAt,
    sourceTimestamp: liveDataEvidence.servedAt,
    freshnessMs: Math.max(
      0,
      Date.now() - new Date(liveDataEvidence.servedAt).getTime(),
    ),
    resultsCount: liveDataEvidence.results.length,
  };
}

export function buildDataAnalysisContext(prompt) {
  const numbers = extractDataSeriesNumbers(prompt);
  if (numbers.length < 2) return null;
  const stats = calcStats(numbers);
  const trend = calcLinearTrend(numbers);
  const direction =
    numbers[numbers.length - 1] > numbers[0]
      ? "upward"
      : numbers[numbers.length - 1] < numbers[0]
        ? "downward"
        : "flat";
  return `Deterministic data-analysis results (authoritative; source order preserved):
- Values: ${numbers.join(", ")}
- Total: ${round2(stats.sum)}
- Mean: ${round2(stats.mean)}
- Median: ${round2(stats.median)}
- First-to-last direction: ${direction}
${
  trend
    ? `- Least-squares trend: y = ${round2(trend.intercept)} + ${round2(trend.slope)} * period
- Next-period forecast: ${round2(trend.intercept + trend.slope * (numbers.length + 1))}`
    : ""
}
Use these checked values exactly. Do not recompute them from memory.`;
}
