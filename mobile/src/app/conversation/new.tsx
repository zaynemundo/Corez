/**
 * Set up a two-persona conversation.
 *
 * The backend stores `chatMode: "conversation"` plus the two personas and tags
 * assistant messages with speaker ids/names. This screen is the entry point from
 * the home starter list; starting creates the chat and opens its transcript.
 */
import { useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { SessionGate } from "@/components/SessionGate";
import { createChat } from "@/api/chats";
import { friendlyError } from "@/lib/errors";
import {
  defaultPersonas,
  handleFor,
  normalizePersona,
  type Persona,
} from "@/lib/conversation";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

export default function NewConversationScreen() {
  return (
    <SessionGate>
      <NewConversationView />
    </SessionGate>
  );
}

function NewConversationView() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const defaults = defaultPersonas();
  const [personas, setPersonas] = useState<Persona[]>(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePersona = (
    index: number,
    patch: Partial<Pick<Persona, "name" | "instructions">>,
  ) => {
    setPersonas((previous) =>
      previous.map((persona, current) => {
        if (current !== index) return persona;
        const next = { ...persona, ...patch };
        return { ...next, handle: handleFor({ handle: next.name, name: next.name }) };
      }),
    );
  };

  const start = async () => {
    if (busy) return;
    const normalized = personas.map((persona, index) =>
      normalizePersona(persona, index),
    );
    if (normalized.some((persona) => !persona.name.trim())) {
      setError(t("conversation.nameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createChat({
        title: t("conversation.defaultTitle"),
        chatMode: "conversation",
        personas: normalized,
      });
      router.replace(`/chat/${created.id}`);
    } catch (caught) {
      setError(friendlyError(caught, t("conversation.failed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "bottom"]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/chat")
          }
          hitSlop={12}
          style={styles.headerButton}
        >
          <Feather name="chevron-left" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t("conversation.title")}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t("conversation.subtitle")}
        </Text>

        {personas.map((persona, index) => (
          <View
            key={persona.id}
            style={[
              styles.card,
              { backgroundColor: colors.bgCard, borderColor: colors.border },
            ]}
          >
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: colors.bgTertiary, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.avatarText, { color: colors.textPrimary }]}>
                  {(persona.name || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                {t("conversation.persona", { number: index + 1 })}
              </Text>
            </View>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("conversation.name")}
            </Text>
            <TextInput
              value={persona.name}
              onChangeText={(value) => updatePersona(index, { name: value })}
              maxLength={40}
              accessibilityLabel={`${t("conversation.name")} ${index + 1}`}
              style={[
                styles.input,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.border,
                },
              ]}
            />
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("conversation.personality")}
            </Text>
            <TextInput
              value={persona.instructions}
              onChangeText={(value) =>
                updatePersona(index, { instructions: value })
              }
              multiline
              maxLength={280}
              textAlignVertical="top"
              accessibilityLabel={`${t("conversation.personality")} ${index + 1}`}
              style={[
                styles.input,
                styles.textarea,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.border,
                },
              ]}
            />
          </View>
        ))}

        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.negative }]}>
            {error}
          </Text>
        ) : null}

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {t("conversation.hint")}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("conversation.start")}
          disabled={busy}
          onPress={() => void start()}
          style={({ pressed }) => [
            styles.start,
            {
              backgroundColor: colors.actionStrong,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.actionStrongContrast} />
          ) : (
            <Text
              style={[styles.startLabel, { color: colors.actionStrongContrast }]}
            >
              {t("conversation.start")}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Outfit_600SemiBold",
    fontSize: 16,
  },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  subtitle: { fontSize: 12.5, lineHeight: 18 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "700" },
  cardTitle: { fontFamily: "Outfit_600SemiBold", fontSize: 15 },
  label: { fontSize: 11.5 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textarea: { minHeight: 84 },
  error: { fontSize: 12.5 },
  hint: { fontSize: 12, lineHeight: 17 },
  start: {
    minHeight: 48,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  startLabel: { fontSize: 14, fontWeight: "600" },
});
