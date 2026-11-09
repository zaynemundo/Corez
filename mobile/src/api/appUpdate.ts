/**
 * Sideload update check.
 *
 * APKs distributed from corez.pro/download cannot be updated by a store, so the
 * app asks the Worker for the latest published build and compares it with the
 * versionCode embedded in this install. The gate shows before the user enters
 * the app; the manual check lives in Settings.
 */
import Constants from "expo-constants";
import * as Application from "expo-application";
import { API_BASE_URL } from "./client";

export interface AppUpdateInfo {
  versionName: string;
  versionCode: number;
  apkUrl: string;
  pageUrl: string;
  notes: string;
  publishedAt: string | null;
}

export interface AppUpdateCheck {
  installedVersionName: string;
  installedVersionCode: number;
  latest: AppUpdateInfo | null;
  updateAvailable: boolean;
}

const FALLBACK_PAGE = "https://corez.pro/download";
const FALLBACK_APK = "https://corez.pro/download/corez.apk";

export function installedVersion(): {
  name: string;
  code: number;
} {
  const config = Constants.expoConfig;
  // expo-application reads the installed manifest, so a JS/config drift can
  // never make an old APK believe it is the latest build.
  const nativeCode = Number(Application.nativeBuildVersion);
  const configCode = Number(config?.android?.versionCode);
  const code =
    Number.isFinite(nativeCode) && nativeCode > 0
      ? nativeCode
      : Number.isFinite(configCode) && configCode > 0
        ? configCode
        : 1;
  return {
    name: Application.nativeApplicationVersion || String(config?.version || "0.1.1"),
    code,
  };
}

function sanitize(data: unknown): AppUpdateInfo | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  const versionCode = Number(raw.versionCode);
  if (!Number.isFinite(versionCode) || versionCode <= 0) return null;
  const versionName =
    typeof raw.versionName === "string" && raw.versionName.trim()
      ? raw.versionName.trim()
      : "New version";
  const pageUrl =
    typeof raw.pageUrl === "string" && /^https?:\/\//i.test(raw.pageUrl)
      ? raw.pageUrl
      : FALLBACK_PAGE;
  const apkUrl =
    typeof raw.apkUrl === "string" && /^https?:\/\//i.test(raw.apkUrl)
      ? raw.apkUrl
      : FALLBACK_APK;
  return {
    versionName,
    versionCode,
    apkUrl,
    pageUrl,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 400) : "",
    publishedAt:
      typeof raw.publishedAt === "string" ? raw.publishedAt : null,
  };
}

export async function checkForAppUpdate(): Promise<AppUpdateCheck> {
  const installed = installedVersion();
  const response = await fetch(`${API_BASE_URL}/download/latest.json`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Update check failed (${response.status}).`);
  }
  const latest = sanitize(await response.json().catch(() => null));
  return {
    installedVersionName: installed.name,
    installedVersionCode: installed.code,
    latest,
    updateAvailable: Boolean(latest && latest.versionCode > installed.code),
  };
}
