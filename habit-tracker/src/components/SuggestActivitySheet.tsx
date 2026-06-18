import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { Radii, Spacing, AppColors } from '../config/theme';
import { useTheme } from '../hooks/useSettings';
import { supabase } from '../api/supabase';
import { getStoredGoogleUserEmail } from '../hooks/useAuth';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SuggestActivitySheet({ visible, onClose }: Props) {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setNote('');
      setSubmitting(false);
    }
  }, [visible]);

  const canSend = name.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSend) return;
    setSubmitting(true);
    try {
      const email = await getStoredGoogleUserEmail();
      if (supabase) {
        const { error } = await supabase.from('suggestions').insert({
          text: name.trim(),
          note: note.trim() || null,
          user_email: email,
        });
        if (error) throw error;
      }
      Toast.show({ type: 'success', text1: 'Đã gửi! Cảm ơn bạn nha 🙌' });
      onClose();
    } catch {
      Toast.show({ type: 'error', text1: 'Gửi chưa được, thử lại sau nha' });
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grip} />
          <Text style={styles.title}>💡 Đề xuất hoạt động</Text>

          <Text style={styles.label}>Bạn muốn có thêm hoạt động gì?</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ví dụ: Thiền"
            placeholderTextColor={C.faint}
            style={styles.input}
            maxLength={60}
          />

          <Text style={styles.label}>Mô tả thêm (tuỳ chọn)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Vài dòng để team hiểu rõ hơn…"
            placeholderTextColor={C.faint}
            style={[styles.input, styles.area]}
            multiline
            maxLength={300}
          />

          <Pressable style={[styles.btn, !canSend && styles.btnOff]} onPress={submit} disabled={!canSend}>
            <Text style={styles.btnText}>{submitting ? 'Đang gửi…' : 'Gửi đề xuất'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,16,11,0.45)' },
    sheet: { backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: Spacing.lg, paddingBottom: Spacing.xl },
    grip: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.line2, alignSelf: 'center', marginBottom: 14 },
    title: { fontSize: 17, fontWeight: '700', color: C.inkDark, marginBottom: 4 },
    label: { fontSize: 12, color: C.muted, marginTop: 12, marginBottom: 6 },
    input: { backgroundColor: C.surface2, borderRadius: Radii.md, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: C.inkDark },
    area: { minHeight: 80, textAlignVertical: 'top' },
    btn: { backgroundColor: C.primary, borderRadius: Radii.md, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
    btnOff: { opacity: 0.45 },
    btnText: { fontSize: 15, fontWeight: '700', color: C.white },
  });
}
