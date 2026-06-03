import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDb } from '../db/client';

const SETTINGS_KEY = ['settings'];

export function useNotificationTime(userId: number) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'notificationTime', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ notification_time: string | null }>(
        'SELECT notification_time FROM users WHERE id = ?',
        [userId]
      );
      return row?.notification_time ?? null;
    },
  });
}

export function useSetNotificationTime(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (time: string | null) => {
      const db = await getDb();
      await db.runAsync(
        'UPDATE users SET notification_time = ? WHERE id = ?',
        [time, userId]
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useNotificationTime2(userId: number) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'notificationTime2', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ notification_time_2: string | null }>(
        'SELECT notification_time_2 FROM users WHERE id = ?',
        [userId]
      );
      return row?.notification_time_2 ?? null;
    },
  });
}

export function useSetNotificationTime2(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (time: string | null) => {
      const db = await getDb();
      await db.runAsync('UPDATE users SET notification_time_2 = ? WHERE id = ?', [time, userId]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useNotificationTime3(userId: number) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, 'notificationTime3', userId],
    queryFn: async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ notification_time_3: string | null }>(
        'SELECT notification_time_3 FROM users WHERE id = ?',
        [userId]
      );
      return row?.notification_time_3 ?? null;
    },
  });
}

export function useSetNotificationTime3(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (time: string | null) => {
      const db = await getDb();
      await db.runAsync('UPDATE users SET notification_time_3 = ? WHERE id = ?', [time, userId]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}
