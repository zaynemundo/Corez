import { ChatView } from "@/components/ChatView";
import { SessionGate } from "@/components/SessionGate";

/** New, unsaved conversation. The first turn creates the chat server-side. */
export default function ChatScreen() {
  return (
    <SessionGate>
      <ChatView />
    </SessionGate>
  );
}
