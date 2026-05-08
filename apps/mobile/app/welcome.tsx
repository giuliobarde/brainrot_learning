import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function Welcome() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.hero}>
        <Text style={styles.title}>Brainrot Learning</Text>
        <Text style={styles.subtitle}>
          Turn your study notes into short, narrated videos you actually watch.
        </Text>
      </View>
      <View style={styles.actions}>
        <Link href="/sign-up" asChild>
          <Pressable style={styles.primary}>
            <Text style={styles.primaryText}>Create account</Text>
          </Pressable>
        </Link>
        <Link href="/login" asChild>
          <Pressable style={styles.secondary}>
            <Text style={styles.secondaryText}>I already have an account</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 24, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center' },
  title: { color: '#fff', fontSize: 36, fontWeight: '800', marginBottom: 12 },
  subtitle: { color: '#a3a3a3', fontSize: 17, lineHeight: 24 },
  actions: { gap: 12, paddingBottom: 32 },
  primary: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryText: { color: '#000', fontSize: 16, fontWeight: '700' },
  secondary: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  secondaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
