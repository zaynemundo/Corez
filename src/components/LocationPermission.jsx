import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import {
  isLocationSupported,
  locationFromPosition,
  locationPromptContext,
  readLocationAccess,
  requestCurrentPosition,
  saveLocationAccess,
} from "../services/locationAccess.js";

/**
 * One-time, app-level location consent. The browser's own geolocation prompt
 * only appears after the user chooses Allow here. The choice and coordinates
 * stay in this browser; they are never written into a chat message.
 */
export default function LocationPermission({ onResolved }) {
  const [status, setStatus] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = readLocationAccess();
    if (saved?.status === "granted" && saved.location) {
      setStatus("granted");
      onResolved?.(locationPromptContext(saved.location));
      return undefined;
    }
    if (saved?.status === "denied") {
      setStatus("denied");
      return undefined;
    }
    if (!isLocationSupported()) {
      setStatus("unsupported");
      return undefined;
    }

    let cancelled = false;
    const check = async () => {
      try {
        if (!navigator.permissions?.query) {
          if (!cancelled) setStatus("prompt");
          return;
        }
        const permission = await navigator.permissions.query({
          name: "geolocation",
        });
        if (cancelled) return;
        if (permission.state === "denied") {
          saveLocationAccess({ status: "denied", decidedAt: Date.now() });
          setStatus("denied");
        } else {
          setStatus("prompt");
        }
      } catch {
        if (!cancelled) setStatus("prompt");
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [onResolved]);

  const allow = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const position = await requestCurrentPosition();
      const location = locationFromPosition(position);
      if (!location) throw new Error("Location coordinates were unavailable.");
      saveLocationAccess({
        status: "granted",
        decidedAt: Date.now(),
        location,
      });
      setStatus("granted");
      onResolved?.(locationPromptContext(location));
    } catch (locationError) {
      if (locationError?.code === 1) {
        saveLocationAccess({ status: "denied", decidedAt: Date.now() });
        setStatus("denied");
      } else {
        setError(
          "We couldn't get your location. You can try again or keep it off.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const decline = () => {
    saveLocationAccess({ status: "denied", decidedAt: Date.now() });
    setStatus("denied");
  };

  if (status !== "prompt") return null;

  return (
    <div
      className="location-permission"
      role="region"
      aria-label="Location permission"
    >
      <span className="location-permission-icon" aria-hidden="true">
        <MapPin size={16} strokeWidth={1.6} />
      </span>
      <div className="location-permission-copy">
        <p>
          <strong>Use your location?</strong> It helps with local time, weather
          and nearby places.
        </p>
        <p className="location-permission-privacy">
          Stays in this browser. Shared with the AI only when it makes a reply
          more useful.
        </p>
        {error ? (
          <p className="location-permission-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="location-permission-actions">
        <button type="button" onClick={allow} disabled={busy}>
          {busy ? "Locating…" : "Allow"}
        </button>
        <button type="button" onClick={decline} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  );
}
