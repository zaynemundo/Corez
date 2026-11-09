/**
 * Interactive card for an `@theme` proposal inside chat.
 *
 * The assistant sends a fenced ```corez-theme JSON block. Instead of showing
 * raw JSON, the native client renders the palette and lets the user save either
 * the colours alone or the colours plus the generated background artwork. The
 * saved theme is applied immediately and cached by the theme provider.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  applyThemeProposal,
  type CustomTheme,
  type ThemeProposal,
} from "@/api/themes";
import {
  isThemeProposalExpired,
} from "@/lib/themeProposal";
import { resolveAssetUrl } from "@/lib/urls";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

const SWATCH_KEYS = [
  "background",
  "surface",
  "text",
  "muted",
  "border",
] as const;

export function ThemeProposalCard({
  proposal,
  onApplied,
  readOnly = false,
}: {
  proposal: ThemeProposal;
  onApplied?: (theme: CustomTheme) => void;
  readOnly?: boolean;
}) {
  const { theme, applyCustomTheme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const [busy, setBusy] = useState<"palette" | "backgrounds" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const expired = isThemeProposalExpired(proposal);
  const atLimit = proposal.slots.used >= proposal.slots.max;
  const hasBackgrounds =
    proposal.options.backgrounds &&
    Boolean(proposal.images?.desktop || proposal.images?.mobile);

  const apply = async (option: "palette" | "backgrounds") => {
    if (busy || expired) return;
    setBusy(option);
    setError(null);
    try {
      const theme = await applyThemeProposal(proposal.proposalId, option);
      applyCustomTheme(theme);
      setSaved(true);
      onApplied?.(theme);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : t("theme.proposal.failed"),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.bgCard, borderColor: colors.border },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: colors.bgTertiary }]}>
          <Feather name="droplet" size={15} color={colors.textSecondary} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {proposal.name}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t("theme.proposal.subtitle")}
          </Text>
        </View>
      </View>

      <View style={styles.swatches}>
        {SWATCH_KEYS.map((key) => (
          <View
            key={key}
            accessibilityLabel={`${key}: ${proposal.palette[key]}`}
            style={[
              styles.swatch,
              {
                backgroundColor: proposal.palette[key],
                borderColor: colors.border,
              },
            ]}
          />
        ))}
      </View>

      {hasBackgrounds ? (
        <View style={styles.previews}>
          {proposal.images?.desktop ? (
            <Image
              source={{ uri: resolveAssetUrl(proposal.images.desktop) }}
              style={[styles.preview, { borderColor: colors.border }]}
              resizeMode="cover"
              accessibilityLabel={t("theme.proposal.desktopArt")}
            />
          ) : null}
          {proposal.images?.mobile ? (
            <Image
              source={{ uri: resolveAssetUrl(proposal.images.mobile) }}
              style={[styles.previewMobile, { borderColor: colors.border }]}
              resizeMode="cover"
              accessibilityLabel={t("theme.proposal.mobileArt")}
            />
          ) : null}
        </View>
      ) : null}

      {expired ? (
        <Text style={[styles.hint, { color: colors.caution }]}>
          {t("theme.proposal.expired")}
        </Text>
      ) : atLimit && !saved ? (
        <Text style={[styles.hint, { color: colors.caution }]}>
          {t("theme.proposal.limit")}
        </Text>
      ) : null}

      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.hint, { color: colors.negative }]}
        >
          {error}
        </Text>
      ) : null}

      {readOnly ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {t("theme.proposal.readOnly")}
        </Text>
      ) : saved ? (
        <View style={styles.savedRow}>
          <Feather name="check" size={15} color={colors.positive} />
          <Text style={[styles.hint, { color: colors.positive }]}>
            {t("theme.proposal.saved")}
          </Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("theme.proposal.useColors")}
            disabled={Boolean(busy) || expired || !proposal.options.palette}
            onPress={() => void apply("palette")}
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: colors.actionStrong,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            {busy === "palette" ? (
              <ActivityIndicator size="small" color={colors.actionStrongContrast} />
            ) : (
              <Text
                style={[
                  styles.primaryLabel,
                  { color: colors.actionStrongContrast },
                ]}
              >
                {t("theme.proposal.useColors")}
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("theme.proposal.useBackgrounds")}
            disabled={Boolean(busy) || expired || !hasBackgrounds}
            onPress={() => void apply("backgrounds")}
            style={({ pressed }) => [
              styles.secondary,
              {
                backgroundColor: colors.bgSecondary,
                borderColor: colors.borderHover,
                opacity: pressed ? 0.85 : 1,
                ...(hasBackgrounds ? {} : { opacity: 0.5 }),
              },
            ]}
          >
            {busy === "backgrounds" ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <Text style={[styles.secondaryLabel, { color: colors.textPrimary }]}>
                {t("theme.proposal.useBackgrounds")}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {!hasBackgrounds && proposal.options.backgroundsReason ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {t("theme.proposal.backgroundsUnavailable")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginVertical: 6,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontFamily: "Outfit_600SemiBold", fontSize: 15.5 },
  subtitle: { fontSize: 12, lineHeight: 17 },
  swatches: { flexDirection: "row", gap: 8 },
  swatch: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previews: { flexDirection: "row", gap: 8, alignItems: "center" },
  preview: {
    flex: 1,
    height: 78,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewMobile: {
    width: 52,
    height: 92,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: { fontSize: 12.5, lineHeight: 18 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  actions: { flexDirection: "row", gap: 8 },
  primary: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: { fontSize: 13, fontWeight: "600" },
  secondary: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLabel: { fontSize: 13, fontWeight: "600" },
});
