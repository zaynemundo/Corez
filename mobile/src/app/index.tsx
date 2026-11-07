import { Redirect } from "expo-router";
import { useAuth } from "@/state/auth";
import {
  SessionFailedScreen,
  SessionLoadingScreen,
} from "@/components/SessionScreens";

/**
 * Entry gate. The session check decides between the app and the login form;
 * a failed check never masquerades as a signed-out user.
 */
export default function Index() {
  const { status, retrySessionCheck } = useAuth();

  if (status === "booting") return <SessionLoadingScreen />;
  if (status === "unverified") {
    return <SessionFailedScreen onRetry={() => void retrySessionCheck()} />;
  }
  return <Redirect href={status === "signedIn" ? "/chat" : "/login"} />;
}
