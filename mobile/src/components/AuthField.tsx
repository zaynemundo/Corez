/**
 * Themed form field matching the web auth card: uppercase label, bordered
 * surface input and an eye toggle for passwords.
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
import { Feather } from "@expo/vector-icons";
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
            backgroundColor: colors.bgTertiary,
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
            <Feather
              name={hidden ? "eye" : "eye-off"}
              size={17}
              color={colors.textSecondary}
            />
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
  wrapper: { gap: 7 },
  label: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    paddingRight: 6,
  },
  toggle: {
    paddingLeft: 8,
    minHeight: 32,
    justifyContent: "center",
  },
  error: { fontSize: 12.5 },
});
