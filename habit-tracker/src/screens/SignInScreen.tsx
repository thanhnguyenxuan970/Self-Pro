import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { GoogleUser } from '../hooks/useAuth';
import { Colors, Typography, Radii, Spacing, Shadows } from '../theme';

type Props = {
  onSignIn: () => void;
  onSignInWithGoogle: (user: GoogleUser) => Promise<void>;
};

export function SignInScreen({ onSignIn, onSignInWithGoogle }: Props) {
  const [loading, setLoading] = useState(false);
  const configuredRef = useRef(false);

  async function handleGoogleSignIn() {
    setLoading(true);
    try {
      const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } =
        await import('@react-native-google-signin/google-signin');
      if (!configuredRef.current) {
        GoogleSignin.configure({});
        configuredRef.current = true;
      }
      try {
        await GoogleSignin.hasPlayServices();
        const response = await GoogleSignin.signIn();
        if (isSuccessResponse(response)) {
          const { email, name, photo } = response.data.user;
          if (!email || !name) {
            Alert.alert('Lỗi', 'Tài khoản Google thiếu thông tin (email/tên).');
            return;
          }
          await onSignInWithGoogle({ email, name, picture: photo ?? '' });
          onSignIn();
        }
      } catch (error: any) {
        if (isErrorWithCode(error)) {
          if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
          if (error.code === statusCodes.IN_PROGRESS) return;
          if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            Alert.alert('Lỗi', 'Google Play Services không khả dụng.');
            return;
          }
        }
        const msg = error instanceof Error ? `${(error as any).code ?? ''}: ${error.message}` : String(error);
        Alert.alert('Lỗi', msg);
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể tải thư viện đăng nhập Google.');
    } finally {
      setLoading(false);
    }
  }

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
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            disabled={loading}
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
  hint: {
    ...Typography.caption,
    color: Colors.faint,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
});
