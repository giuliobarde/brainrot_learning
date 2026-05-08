import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, ApiError } from '../src/lib/apiClient';

type Mode = 'paste' | 'file';

const ALLOWED_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export default function Upload() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submitPaste() {
    setError(null);
    setSuccess(null);
    if (text.trim().length === 0) {
      setError('Paste some text first.');
      return;
    }
    setSubmitting(true);
    try {
      const { sourceMaterial } = await api.uploadSourceText({ text });
      setSuccess(`Saved (${sourceMaterial.charCount} chars).`);
      setText('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFile() {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) {
        setSubmitting(false);
        return;
      }
      const asset = result.assets[0];
      if (!asset) {
        setError('No file picked.');
        setSubmitting(false);
        return;
      }
      const { sourceMaterial } = await api.uploadSourceFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
      });
      setSuccess(`Uploaded ${asset.name} (${sourceMaterial.charCount} chars extracted).`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Upload material</Text>
        <Text style={styles.subtitle}>Paste notes or pick a .txt / .md / .pdf / .docx file.</Text>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === 'paste' && styles.tabActive]}
            onPress={() => setMode('paste')}
          >
            <Text style={mode === 'paste' ? styles.tabTextActive : styles.tabText}>Paste text</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === 'file' && styles.tabActive]}
            onPress={() => setMode('file')}
          >
            <Text style={mode === 'file' ? styles.tabTextActive : styles.tabText}>File</Text>
          </Pressable>
        </View>

        {mode === 'paste' ? (
          <>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Paste a transcript, lecture notes, etc."
              placeholderTextColor="#666"
              style={styles.textarea}
            />
            <Pressable
              style={[styles.primary, submitting && styles.disabled]}
              onPress={() => void submitPaste()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryText}>Save text</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.dropzone}>
              <Text style={styles.dropzoneTitle}>Pick a document</Text>
              <Text style={styles.dropzoneBody}>
                We support .txt, .md, .pdf, and .docx up to 15 MB.
              </Text>
            </View>
            <Pressable
              style={[styles.primary, submitting && styles.disabled]}
              onPress={() => void submitFile()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryText}>Choose file</Text>
              )}
            </Pressable>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <Pressable style={styles.secondary} onPress={() => router.push('/library')}>
          <Text style={styles.secondaryText}>View uploaded material</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  container: { padding: 24, gap: 16 },
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
    minHeight: 200,
    textAlignVertical: 'top',
  },
  dropzone: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    gap: 6,
    alignItems: 'center',
  },
  dropzoneTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dropzoneBody: { color: '#888', fontSize: 13, textAlign: 'center' },
  primary: { backgroundColor: '#fff', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  primaryText: { color: '#000', fontSize: 16, fontWeight: '700' },
  secondary: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  secondaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  error: { color: '#ff8a8a', fontSize: 14 },
  success: { color: '#7fdc8a', fontSize: 14 },
});
