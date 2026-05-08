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

import { useAuth } from '../src/auth/AuthContext';
import { hasErrors, validateSignUp, type FieldErrors } from '../src/auth/validation';

export default function SignUp() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit() {
    const fieldErrors = validateSignUp({ email, password, displayName });
    setErrors(fieldErrors);
    setServerError(null);
    if (hasErrors(fieldErrors)) return;
    setSubmitting(true);
    try {
      await signUp(email.trim(), password, displayName.trim());
      router.replace('/home');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Sign up failed');
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
        <Text style={styles.title}>Create account</Text>

        <Field
          label="Display name"
          value={displayName}
          onChange={setDisplayName}
          error={errors.displayName}
          autoCapitalize="words"
        />
        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          error={errors.email}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          secureTextEntry
          autoComplete="password-new"
        />

        {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

        <Pressable
          style={[styles.primary, submitting && styles.disabled]}
          onPress={onSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryText}>Sign up</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (s: string) => void;
  error?: string;
} & Omit<React.ComponentProps<typeof TextInput>, 'onChange' | 'onChangeText' | 'value' | 'style'>;

function Field({ label, value, onChange, error, ...rest }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor="#666"
        style={[styles.input, Boolean(error) && styles.inputError]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  container: { padding: 24, gap: 16 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 8 },
  field: { gap: 6 },
  label: { color: '#a3a3a3', fontSize: 13 },
  input: {
    color: '#fff',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  inputError: { borderColor: '#b34141' },
  error: { color: '#ff8a8a', fontSize: 13 },
  serverError: { color: '#ff8a8a', fontSize: 14 },
  primary: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryText: { color: '#000', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
