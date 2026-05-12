import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../src/auth/AuthContext';
import { getApiBaseUrl } from '../src/lib/secureStorage';

export default function Home() {
  const { user, signOut, status } = useAuth();
  const router = useRouter();
  const [healthLine, setHealthLine] = useState<string>('checking…');

  useEffect(() => {
    let cancelled = false;
    fetch(`${getApiBaseUrl()}/healthz`)
      .then(async (r) => {
        const body = await r.json();
        if (cancelled) return;
        const mongo = body?.data?.mongo?.status ?? 'unknown';
        setHealthLine(`api ${r.status} · mongo ${mongo}`);
      })
      .catch((err) => {
        if (cancelled) return;
        setHealthLine(`unreachable: ${err instanceof Error ? err.message : 'error'}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/welcome');
  }, [status, router]);

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.greeting}>Hi, {user?.displayName ?? 'there'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backend status</Text>
        <Text style={styles.cardBody}>{healthLine}</Text>
      </View>

      <View style={styles.actions}>
        {user?.role === 'admin' ? (
          <Pressable style={styles.primary} onPress={() => router.push('/admin')}>
            <Text style={styles.primaryText}>Admin Studio</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={user?.role === 'admin' ? styles.secondary : styles.primary}
          onPress={() => router.push('/upload')}
        >
          <Text style={user?.role === 'admin' ? styles.secondaryText : styles.primaryText}>
            Upload material
          </Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push('/library')}>
          <Text style={styles.secondaryText}>My library</Text>
        </Pressable>
      </View>

      <Pressable style={styles.logout} onPress={() => void signOut()}>
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 24, justifyContent: 'space-between' },
  greeting: { color: '#fff', fontSize: 28, fontWeight: '700' },
  email: { color: '#888', fontSize: 15, marginTop: 4 },
  card: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
    gap: 6,
  },
  cardTitle: { color: '#a3a3a3', fontSize: 13 },
  cardBody: { color: '#fff', fontSize: 16, fontWeight: '600' },
  actions: { gap: 12 },
  primary: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryText: { color: '#000', fontSize: 16, fontWeight: '700' },
  secondary: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  secondaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  logout: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
