import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../src/auth/AuthContext';
import {
  api,
  ApiError,
  type AdminGenerateInput,
  type ApiSourceMaterial,
  type ApiVideo,
} from '../src/lib/apiClient';

type InputMode = 'paste' | 'material';
type Length = NonNullable<AdminGenerateInput['length']>;
type Tone = NonNullable<AdminGenerateInput['tone']>;

const LENGTHS: Length[] = ['short', 'medium', 'long'];
const TONES: Tone[] = ['casual', 'energetic', 'serious'];

function describeStage(video: ApiVideo): string {
  if (video.status === 'failed') return 'Failed';
  if (video.status === 'ready') return 'Ready';
  const last = video.processingLogs?.[video.processingLogs.length - 1];
  if (!last) return video.status === 'pending' ? 'Queued' : 'Working';
  if (/compos/i.test(last)) return 'Assembling video';
  if (/voice/i.test(last)) return 'Synthesizing voice';
  if (/script/i.test(last)) return 'Writing script';
  return last;
}

export default function AdminStudio() {
  const router = useRouter();
  const { user, status } = useAuth();

  const [mode, setMode] = useState<InputMode>('paste');
  const [text, setText] = useState('');
  const [topicHint, setTopicHint] = useState('');
  const [length, setLength] = useState<Length>('short');
  const [tone, setTone] = useState<Tone>('casual');
  const [materials, setMaterials] = useState<ApiSourceMaterial[] | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<ApiVideo | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/welcome');
  }, [status, router]);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/home');
  }, [user, router]);

  useEffect(() => {
    if (mode !== 'material' || materials !== null) return;
    void api
      .listSourceMaterial()
      .then((res) => setMaterials(res.sourceMaterials))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'List failed'));
  }, [mode, materials]);

  useEffect(() => () => stopPolling(), []);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (mode === 'paste') return text.trim().length > 0;
    return Boolean(selectedMaterialId);
  }, [busy, mode, text, selectedMaterialId]);

  async function submit() {
    setError(null);
    setVideo(null);
    setBusy(true);
    stopPolling();
    try {
      const input: AdminGenerateInput = {
        topicHint: topicHint.trim() || undefined,
        length,
        tone,
        ...(mode === 'paste'
          ? { sourceText: text.trim() }
          : { sourceMaterialId: selectedMaterialId ?? undefined }),
      };
      const { video: created } = await api.generateAdminVideo(input);
      setVideo(created);
      startPolling(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generation failed');
      setBusy(false);
    }
  }

  function startPolling(id: string) {
    pollRef.current = setInterval(async () => {
      try {
        const { video: fresh } = await api.getVideo(id);
        setVideo(fresh);
        if (fresh.status === 'ready' || fresh.status === 'failed') {
          stopPolling();
          setBusy(false);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Polling failed');
        stopPolling();
        setBusy(false);
      }
    }, 2000);
  }

  async function publish() {
    if (!video) return;
    try {
      const res = await api.publishVideo(video.id);
      setVideo(res.video);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Publish failed');
    }
  }

  async function unpublish() {
    if (!video) return;
    try {
      const res = await api.unpublishVideo(video.id);
      setVideo(res.video);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unpublish failed');
    }
  }

  function confirmDiscard() {
    if (!video) return;
    Alert.alert('Discard this video?', 'This deletes the generated video.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteVideo(video.id);
            setVideo(null);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Delete failed');
          }
        },
      },
    ]);
  }

  if (!user || user.role !== 'admin') {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>Admin only.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Admin Studio</Text>
        <Text style={styles.subtitle}>
          Generate a video from notes, then publish to the public feed.
        </Text>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === 'paste' && styles.tabActive]}
            onPress={() => setMode('paste')}
          >
            <Text style={mode === 'paste' ? styles.tabTextActive : styles.tabText}>Paste text</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === 'material' && styles.tabActive]}
            onPress={() => setMode('material')}
          >
            <Text style={mode === 'material' ? styles.tabTextActive : styles.tabText}>
              Pick uploaded
            </Text>
          </Pressable>
        </View>

        {mode === 'paste' ? (
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Paste a transcript or notes here…"
            placeholderTextColor="#666"
            style={styles.textarea}
            editable={!busy}
          />
        ) : (
          <View style={styles.materialList}>
            {materials === null ? (
              <ActivityIndicator color="#fff" />
            ) : materials.length === 0 ? (
              <Text style={styles.subtitle}>No uploaded material yet.</Text>
            ) : (
              materials.map((m) => (
                <Pressable
                  key={m.id}
                  style={[
                    styles.materialItem,
                    selectedMaterialId === m.id && styles.materialActive,
                  ]}
                  onPress={() => setSelectedMaterialId(m.id)}
                  disabled={busy}
                >
                  <Text style={styles.materialTitle} numberOfLines={1}>
                    {m.originalFilename ?? `${m.charCount} chars`}
                  </Text>
                  <Text style={styles.materialPreview} numberOfLines={2}>
                    {m.preview}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        )}

        <TextInput
          value={topicHint}
          onChangeText={setTopicHint}
          placeholder="Topic hint (optional, e.g. Biology)"
          placeholderTextColor="#666"
          style={styles.input}
          editable={!busy}
        />

        <View style={styles.row}>
          <Text style={styles.label}>Length</Text>
          <View style={styles.chips}>
            {LENGTHS.map((l) => (
              <Pressable
                key={l}
                style={[styles.chip, length === l && styles.chipActive]}
                onPress={() => setLength(l)}
                disabled={busy}
              >
                <Text style={length === l ? styles.chipTextActive : styles.chipText}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Tone</Text>
          <View style={styles.chips}>
            {TONES.map((t) => (
              <Pressable
                key={t}
                style={[styles.chip, tone === t && styles.chipActive]}
                onPress={() => setTone(t)}
                disabled={busy}
              >
                <Text style={tone === t ? styles.chipTextActive : styles.chipText}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          style={[styles.primary, !canSubmit && styles.disabled]}
          onPress={() => void submit()}
          disabled={!canSubmit}
        >
          {busy && !video ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryText}>Generate</Text>
          )}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {video ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{video.title || 'Generating…'}</Text>
            <Text style={styles.cardLine}>Status: {video.status}</Text>
            <Text style={styles.cardLine}>Stage: {describeStage(video)}</Text>
            {video.durationSeconds ? (
              <Text style={styles.cardLine}>Duration: {video.durationSeconds.toFixed(1)}s</Text>
            ) : null}
            {video.processingLogs && video.processingLogs.length > 0 ? (
              <View style={styles.logBox}>
                {video.processingLogs.slice(-5).map((line, i) => (
                  <Text key={i} style={styles.logLine} numberOfLines={1}>
                    · {line}
                  </Text>
                ))}
              </View>
            ) : null}

            {video.status === 'ready' ? (
              <View style={styles.actions}>
                {video.visibility === 'private' ? (
                  <Pressable style={styles.primary} onPress={() => void publish()}>
                    <Text style={styles.primaryText}>Publish to feed</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.secondary} onPress={() => void unpublish()}>
                    <Text style={styles.secondaryText}>Unpublish</Text>
                  </Pressable>
                )}
                <Pressable style={styles.danger} onPress={confirmDiscard}>
                  <Text style={styles.dangerText}>Discard</Text>
                </Pressable>
              </View>
            ) : null}
            {video.status === 'failed' ? (
              <Pressable style={styles.danger} onPress={confirmDiscard}>
                <Text style={styles.dangerText}>Discard</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  container: { padding: 24, gap: 12 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#a3a3a3', fontSize: 14 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    padding: 4,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#222' },
  tabText: { color: '#888', fontWeight: '600' },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  textarea: {
    color: '#fff',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 160,
    textAlignVertical: 'top',
  },
  input: {
    color: '#fff',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
  },
  row: { gap: 6 },
  label: { color: '#a3a3a3', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#111',
  },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#000', fontSize: 13, fontWeight: '700' },
  materialList: { gap: 8 },
  materialItem: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  materialActive: { borderColor: '#fff' },
  materialTitle: { color: '#fff', fontWeight: '700' },
  materialPreview: { color: '#888', fontSize: 12 },
  primary: { backgroundColor: '#fff', paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  primaryText: { color: '#000', fontSize: 16, fontWeight: '700' },
  secondary: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  secondaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  danger: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#552020',
  },
  dangerText: { color: '#ff8a8a', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { color: '#ff8a8a', fontSize: 14 },
  card: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cardLine: { color: '#a3a3a3', fontSize: 13 },
  logBox: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    padding: 8,
    gap: 2,
    marginTop: 4,
  },
  logLine: { color: '#666', fontSize: 11, fontFamily: 'Menlo' },
  actions: { gap: 8, marginTop: 6 },
});
