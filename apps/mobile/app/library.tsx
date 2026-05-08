import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, ApiError, type ApiSourceMaterial } from '../src/lib/apiClient';

export default function Library() {
  const [items, setItems] = useState<ApiSourceMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { sourceMaterials } = await api.listSourceMaterial();
      setItems(sourceMaterials);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onDelete(id: string) {
    Alert.alert('Delete material?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSourceMaterial(id);
            setItems((prev) => prev.filter((s) => s.id !== id));
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Delete failed.');
          }
        },
      },
    ]);
  }

  if (loading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing uploaded yet</Text>
            <Text style={styles.emptyBody}>Pull to refresh or upload from the home screen.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.kind}>{item.kind.toUpperCase()}</Text>
              <Text style={styles.chars}>{item.charCount.toLocaleString()} chars</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {item.originalFilename ?? '(pasted text)'}
            </Text>
            <Text style={styles.preview} numberOfLines={3}>
              {item.preview}
            </Text>
            <Pressable style={styles.delete} onPress={() => void onDelete(item.id)}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  emptyContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  listContent: { padding: 16, gap: 12 },
  empty: { alignItems: 'center', gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  emptyBody: { color: '#888', fontSize: 14, textAlign: 'center' },
  error: { color: '#ff8a8a', fontSize: 13, marginTop: 12 },
  card: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  kind: { color: '#7fdc8a', fontSize: 12, fontWeight: '700' },
  chars: { color: '#888', fontSize: 12 },
  name: { color: '#fff', fontSize: 15, fontWeight: '600' },
  preview: { color: '#a3a3a3', fontSize: 13, lineHeight: 18 },
  delete: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10 },
  deleteText: { color: '#ff8a8a', fontSize: 13, fontWeight: '600' },
});
