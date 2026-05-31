import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleUser } from '../hooks/useAuth';
import { Colors, Typography, Radii, Spacing, Shadows } from '../theme';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  onSignIn: () => void;
  onSignInWithGoogle: (user: GoogleUser) => Promise<void>;
};

export function SignInScreen({ onSignIn, onSignInWithGoogle }: Props) {
  const [loading, setLoading] = useState(false);
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const token = response.authentication?.accessToken;
    if (!token) return;
    setLoading(true);
    fetch('https://www.googleapis.com/userinfo/v2/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(async (profile: { email: string; name: string; picture: string }) => {
        await onSignInWithGoogle({ email: profile.email, name: profile.name, picture: profile.picture });
        onSignIn();
      })
      .catch(() => Alert.alert('Lỗi', 'Không thể lấy thông tin Google.'))
      .finally(() => setLoading(false));
  }, [response]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.logo}>🌿</Text>
        <Text style={styles.title}>Greedy Clock</Text>
        <Text style={styles.subtitle}>Theo dõi thói quen, tự thưởng xứng đáng.</Text>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} />
        ) : (
          <TouchableOpacity
            style={[styles.googleButton, !request && styles.buttonDisabled]}
            onPress={() => promptAsync()}
            disabled={!request || loading}
            activeOpacity={0.8}
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleButtonText}>Đăng nhập bằng Google</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.hint}>MVP · Xác thực qua Google · Dữ liệu lưu trên máy</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgBase,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadows.medium,
  },
  logo: { fontSize: 52, marginBottom: Spacing.sm },
  title: { ...Typography.title, color: Colors.inkDark, marginBottom: 4 },
  subtitle: {
    ...Typography.body,
    color: Colors.muted,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  googleButton: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: Radii.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.line,
    ...Shadows.light,
  },
  googleIcon: { fontSize: 18, fontWeight: '700', color: '#4285F4', marginRight: 10 },
  googleButtonText: { color: Colors.inkDark, fontWeight: '600', fontSize: 16 },
  buttonDisabled: { opacity: 0.4 },
  hint: {
    ...Typography.caption,
    color: Colors.faint,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
});
