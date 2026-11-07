import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/state/theme";

export default function NotFoundScreen() {
  const { theme } = useTheme();
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.bgPrimary }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
          Page not found
        </Text>
        <Link href="/" style={[styles.link, { color: theme.colors.textPrimary }]}>
          Go to Corez
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  title: { fontSize: 18, fontWeight: "600" },
  link: { fontSize: 14, textDecorationLine: "underline" },
});
