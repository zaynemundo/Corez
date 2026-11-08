// End-to-end contract for the user-designed theme API (worker/themeRoutes.js):
// auth, slot limits, proposal generation, image storage/cleanup, idempotent
// apply, ownership and expiry. Runs the real Worker entrypoint against a real
// in-memory SQLite D1 (tests/helpers/sqliteD1.js) and an in-memory R2 bucket.
import assert from "node:assert/strict";
import worker from "../worker/entry.js";
import { createSqliteD1 } from "./helpers/sqliteD1.js";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const VALID_SPEC = {
  name: "Porsche Red",
  palette: {
    background: "#120607",
    surface: "#1e0b0d",
    text: "#f7ecec",
    muted: "#c9a8ab",
    border: "#5a2a30",
  },
  imagePrompts: {
    desktop: "a red Porsche 911 on a wet road at night",
    mobile: "a portrait red Porsche 911 close up",
  },
};

function memoryBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, options = {}) {
      objects.set(key, { body, options });
    },
    async delete(key) {
      objects.delete(key);
    },
    async head(key) {
      return objects.has(key) ? { size: 1 } : null;
    },
    async get(key) {
      return objects.get(key) || null;
    },
  };
}

function createHarness() {
  const db = createSqliteD1();
  const bucket = memoryBucket();
  const state = {
    spec: VALID_SPEC,
    providerMode: "ok",
    providerCalls: 0,
  };
  const env = {
    DB: db,
    ASSET_BUCKET: bucket,
    AI: {
      async run() {
        return { image: PNG };
      },
    },
    ENVIRONMENT: "development",
    USAGE_METERING_DISABLED: "1",
    OPENCODE_GO_API_KEY: "sk-opencode-test",
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (!target.includes("opencode.ai") && !target.includes("api.")) {
      return new Response("unexpected fetch", { status: 500 });
    }
    state.providerCalls += 1;
    if (state.providerMode === "fail") {
      return new Response(JSON.stringify({ error: "provider down" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const content =
      state.providerMode === "invalid-palette"
        ? JSON.stringify({
            ...VALID_SPEC,
            palette: { ...VALID_SPEC.palette, background: "url(https://evil.test)" },
          })
        : JSON.stringify(state.spec);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  let requestIp = 0;
  const nextIp = () => `203.0.113.${1 + (requestIp++ % 250)}`;
  const request = (path, method = "GET", body = null, extraEnv = {}, ip = null) => {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (ip) headers["CF-Connecting-IP"] = ip;
    return worker.fetch(
      new Request("https://corez.test" + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),
      { ...env, ...extraEnv },
    );
  };
  const propose = (prompt, extraEnv = {}, ip = nextIp()) =>
    request("/api/themes/propose", "POST", { prompt }, extraEnv, ip);
  const json = async (response) => ({ status: response.status, body: await response.json() });
  return {
    db,
    bucket,
    env,
    state,
    request,
    propose,
    json,
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

async function run() {
  const harness = createHarness();
  try {
    // --- auth -------------------------------------------------------------
    const unauth = await harness.request("/api/themes", "GET", null, {
      AUTH_SECRET: "test-secret",
    });
    assert.equal(unauth.status, 401);
    assert.equal((await unauth.json()).code, "unauthorized");

    // --- empty list -------------------------------------------------------
    let res = await harness.json(await harness.request("/api/themes"));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.themes, []);
    assert.equal(res.body.max, 2);

    // --- invalid prompt is rejected before any provider work -------------
    const callsBefore = harness.state.providerCalls;
    res = await harness.json(
      await harness.propose("  ", {}, "198.51.100.10"),
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "invalid_prompt");
    assert.equal(harness.state.providerCalls, callsBefore);

    // --- invalid model palette -> 502, nothing stored ---------------------
    harness.state.providerMode = "invalid-palette";
    res = await harness.json(
      await harness.propose("a 911 Porsche in red"),
    );
    assert.equal(res.status, 502);
    assert.equal(res.body.code, "theme_design_failed");
    assert.equal((await harness.db.prepare("SELECT COUNT(*) AS n FROM theme_proposals").first())?.n, 0);

    // --- propose: palette + two background images -------------------------
    harness.state.providerMode = "ok";
    res = await harness.json(
      await harness.propose("a 911 Porsche in red"),
    );
    assert.equal(res.status, 200);
    const firstProposal = res.body.proposal;
    assert.equal(firstProposal.v, 1);
    assert.equal(firstProposal.name, "Porsche Red");
    assert.equal(firstProposal.options.backgrounds, true);
    assert.ok(firstProposal.images.desktop.startsWith("/api/assets/"));
    assert.ok(firstProposal.images.mobile.startsWith("/api/assets/"));
    assert.equal(harness.bucket.objects.size, 2);
    for (const key of harness.bucket.objects.keys()) {
      assert.ok(key.startsWith("users/dev/assets/theme_"), key);
    }

    // --- list is still empty until one option is chosen -------------------
    res = await harness.json(await harness.request("/api/themes"));
    assert.deepEqual(res.body.themes, []);

    // --- apply "palette": saves the theme and deletes both images ---------
    res = await harness.json(
      await harness.request("/api/themes/apply", "POST", {
        proposalId: firstProposal.proposalId,
        option: "palette",
      }),
    );
    assert.equal(res.status, 200);
    const paletteTheme = res.body.theme;
    assert.equal(paletteTheme.name, "Porsche Red");
    assert.equal(paletteTheme.images, null);
    assert.equal(paletteTheme.tone, "dark");
    assert.equal(typeof paletteTheme.tokens.solid["--bg-primary"], "string");
    assert.equal(harness.bucket.objects.size, 0, "unused background images must be deleted");

    // A second apply is idempotent and returns the same saved theme.
    const reapply = await harness.json(
      await harness.request("/api/themes/apply", "POST", {
        proposalId: firstProposal.proposalId,
        option: "palette",
      }),
    );
    assert.equal(reapply.status, 200);
    assert.equal(reapply.body.theme.id, paletteTheme.id);

    // --- propose + apply "backgrounds": keeps the images ------------------
    res = await harness.json(
      await harness.propose("midnight purple studio"),
    );
    assert.equal(res.status, 200);
    const secondProposal = res.body.proposal;
    res = await harness.json(
      await harness.request("/api/themes/apply", "POST", {
        proposalId: secondProposal.proposalId,
        option: "backgrounds",
      }),
    );
    assert.equal(res.status, 200);
    const backgroundTheme = res.body.theme;
    assert.ok(backgroundTheme.images.desktop.startsWith("/api/assets/"));
    assert.ok(backgroundTheme.images.mobile.startsWith("/api/assets/"));
    assert.equal(harness.bucket.objects.size, 2);

    // Both saved themes are listed.
    res = await harness.json(await harness.request("/api/themes"));
    assert.equal(res.body.themes.length, 2);

    // --- third theme is refused before the model is called ----------------
    const providerCalls = harness.state.providerCalls;
    res = await harness.json(
      await harness.propose("one more"),
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "theme_limit");
    assert.equal(harness.state.providerCalls, providerCalls);
    assert.equal(harness.bucket.objects.size, 2);

    // --- discard removes a pending proposal and its images ----------------
    res = await harness.json(
      await harness.request("/api/themes/" + backgroundTheme.id, "DELETE"),
    );
    assert.equal(res.status, 200);
    assert.equal(harness.bucket.objects.size, 0, "deleting a theme deletes its images");
    res = await harness.json(
      await harness.request("/api/themes/" + backgroundTheme.id, "DELETE"),
    );
    assert.equal(res.status, 404);

    // --- expiry ------------------------------------------------------------
    res = await harness.json(
      await harness.propose("expiring theme"),
    );
    assert.equal(res.status, 200);
    const expiring = res.body.proposal;
    assert.equal(harness.bucket.objects.size, 2);
    harness.db
      .prepare("UPDATE theme_proposals SET expires_at = ? WHERE id = ?")
      .bind(Date.now() - 1000, expiring.proposalId)
      .run();
    res = await harness.json(
      await harness.request("/api/themes/apply", "POST", {
        proposalId: expiring.proposalId,
        option: "backgrounds",
      }),
    );
    assert.equal(res.status, 410);
    assert.equal(res.body.code, "proposal_expired");
    assert.equal(harness.bucket.objects.size, 0, "expired proposal images are swept");

    // --- discard endpoint --------------------------------------------------
    res = await harness.json(
      await harness.propose("discard me"),
    );
    assert.equal(res.status, 200);
    const discardable = res.body.proposal;
    res = await harness.json(
      await harness.request("/api/themes/proposals/" + discardable.proposalId + "/discard", "POST", {}),
    );
    assert.equal(res.status, 200);
    assert.equal(harness.bucket.objects.size, 0);

    // --- ownership: another account's theme is invisible / undeletable -----
    await harness.db
      .prepare(
        "INSERT INTO user_themes (id, user_id, name, tone, palette, tokens, image_keys, proposal_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        "foreign_theme",
        "someone-else",
        "Foreign",
        "dark",
        "{}",
        "{}",
        null,
        "foreign_proposal",
        Date.now(),
        Date.now(),
      )
      .run();
    res = await harness.json(
      await harness.request("/api/themes/foreign_theme", "DELETE"),
    );
    assert.equal(res.status, 404);
    assert.equal(
      (await harness.db.prepare("SELECT COUNT(*) AS n FROM user_themes WHERE id = ?").bind("foreign_theme").first())?.n,
      1,
    );
    res = await harness.json(await harness.request("/api/themes"));
    assert.equal(
      res.body.themes.some((theme) => theme.id === "foreign_theme"),
      false,
      "GET /api/themes never leaks another account's theme",
    );

    // --- per-client rate limit ---------------------------------------------
    const limitedIp = "198.51.100.77";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const allowed = await harness.json(
        await harness.propose("rate check " + attempt, {}, limitedIp),
      );
      assert.equal(allowed.status, 200, "first five proposals from one IP are allowed");
    }
    const limited = await harness.json(
      await harness.propose("rate check final", {}, limitedIp),
    );
    assert.equal(limited.status, 429);
    assert.equal(limited.body.code, "rate_limited");

    // --- cleanup helper is exported and works ------------------------------
    const { pruneThemeProposals } = await import("../worker/themeRoutes.js");
    assert.equal(typeof pruneThemeProposals, "function");
    assert.equal(await pruneThemeProposals({}, Date.now()), 0);

    console.log("theme worker contract: PASS");
  } finally {
    harness.restore();
  }
}

run().catch((error) => {
  console.error("theme worker contract: FAIL");
  console.error(error);
  process.exitCode = 1;
});