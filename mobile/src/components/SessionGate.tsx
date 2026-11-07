/**
 * Route gate for signed-in screens. Renders the boot spinner, the retry screen
 * or a redirect to login; children render only for a verified session.
 */
import type { ReactNode } from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/state/auth";
import { SessionFailedScreen, SessionLoadingScreen } from "./SessionScreens";

export function SessionGate({ children }: { children: ReactNode }) {
  const { status, retrySessionCheck } = useAuth();

  if (status === "booting") return <SessionLoadingScreen />;
  if (status === "unverified") {
    return <SessionFailedScreen onRetry={() => void retrySessionCheck()} />;
  }
  if (status === "signedOut") return <Redirect href="/login" />;
  return <>{children}</>;
}
