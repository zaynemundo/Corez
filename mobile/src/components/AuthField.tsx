/**
 * Themed form field with an optional password visibility toggle.
 */
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useTheme } from "@/state/theme";
import { useI18n } from "@/i18n";

interface AuthFieldProps extends TextInputProps {
  label: string;
  secure?: boolean;
  errorText?: string | null;
}

export function AuthField({
  label,
  secure = false,
  errorText,
  ...inputProps
}: AuthFieldProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const colors = theme.colors;
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secure);

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.bgSecondary,
            borderColor: focused ? colors.borderHover : colors.border,
          },
        ]}
      >
        <TextInput
          {...inputProps}
          style={[styles.input, { color: colors.textPrimary }]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure && hidden}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          autoCapitalize={inputProps.autoCapitalize ?? "none"}
          autoCorrect={false}
          accessibilityLabel={label}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hidden
                ? t("auth.common.showPassword")
                : t("auth.common.hidePassword")
            }
            onPress={() => setHidden((prev) => !prev)}
            hitSlop={10}
            style={styles.toggle}
          >
            <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
              {hidden ? t("auth.common.showPassword") : t("auth.common.hidePassword")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {errorText ? (
        <Text style={[styles.error, { color: colors.negative }]}>
          {errorText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 12.5, fontWeight: "500" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  toggle: {
    paddingLeft: 8,
  },
  toggleText: {
    fontSize: 11.5,
    textDecorationLine: "underline",
  },
  error: { fontSize: 12.5 },
});
