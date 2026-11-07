import { useLocalSearchParams } from "expo-router";
import { ChatView } from "@/components/ChatView";
import { SessionGate } from "@/components/SessionGate";

/** A stored conversation, loaded from `/api/chats/:id`. */
export default function StoredChatScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const chatId = Array.isArray(params.id) ? params.id[0] : params.id;
  return (
    <SessionGate>
      <ChatView key={chatId ?? "none"} initialChatId={chatId} />
    </SessionGate>
  );
}
