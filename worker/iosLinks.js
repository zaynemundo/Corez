// Apple App Site Association for iOS Universal Links.
//
// iOS verifies `https://corez.pro/.well-known/apple-app-site-association`
// (served as application/json, no redirect, no file extension) before it opens
// CoreZ links. The Team ID is supplied by the deployment environment, exactly
// like the Android asset-links fingerprint, so the repository never pins a
// certificate identity it cannot rotate.

const IOS_LINK_PATHS = [
  "/chat",
  "/chat/*",
  "/sites",
  "/sites/*",
  "/share/chat/*",
];

export function buildAppleAppSiteAssociation(env = {}) {
  const teamId = String(env?.APPLE_TEAM_ID || "")
    .trim()
    .toUpperCase();
  const bundleId = String(env?.APPLE_BUNDLE_ID || "pro.corez.app").trim();
  if (!/^[A-Z0-9]{10}$/.test(teamId) || !bundleId) {
    return { applinks: { details: [] } };
  }
  return {
    applinks: {
      details: [
        {
          appID: `${teamId}.${bundleId}`,
          paths: IOS_LINK_PATHS,
        },
      ],
    },
  };
}

export async function handleAppleAppSiteAssociation(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }
  const body =
    request.method === "HEAD"
      ? null
      : JSON.stringify(buildAppleAppSiteAssociation(env));
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
