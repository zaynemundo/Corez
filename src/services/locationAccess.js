const LOCATION_KEY = "corez_location_consent_v1";

export const LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isLocationSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.geolocation);
}

export function readLocationAccess() {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCATION_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    if (!["granted", "denied"].includes(parsed.status)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocationAccess(access) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(access));
  } catch {
    // A blocked storage partition must not break the chat.
  }
}

export function clearLocationAccess() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LOCATION_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!isLocationSupported()) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(error),
      {
        // City-level precision is enough for weather/local context and avoids
        // asking the browser for a high-accuracy fix.
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 15 * 60 * 1000,
      },
    );
  });
}

export function locationFromPosition(position) {
  const coords = position?.coords || {};
  const latitude = Number(coords.latitude);
  const longitude = Number(coords.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const accuracy = Number(coords.accuracy);
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
    savedAt: Date.now(),
  };
}

export function formatLocationContext(location) {
  if (!location) return "";
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  const timeZone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "";
  const roundedLatitude = latitude.toFixed(2);
  const roundedLongitude = longitude.toFixed(2);
  const accuracy = Number(location.accuracy);
  return [
    `approximate coordinates ${roundedLatitude}, ${roundedLongitude}`,
    Number.isFinite(accuracy) && accuracy > 0
      ? `accuracy about ${Math.max(100, Math.round(accuracy / 100) * 100)} m`
      : null,
    timeZone ? `timezone ${timeZone}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function locationPromptContext(location) {
  const details = formatLocationContext(location);
  if (!details) return "";
  return `Approximate user location (consented): ${details}. Use it only when location makes the answer more useful, such as weather, local time, nearby places or travel. Do not mention the location otherwise.`;
}
