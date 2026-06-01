// useDurationLogger.ts — one-call logging for a duration habit.
// Handles: star computation, optimistic UI, the DB write, and cache invalidation.

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { computeStars, DEFAULT_POINT_CONFIG, type PointConfig } from './points';
import { logEvent } from './logEvent';     // the transaction from the earlier schema doc

interface Args {
  userId: number;
  taskTypeId: number;
  localDate: string;                        // YYYY-MM-DD in user tz
  config?: PointConfig;
}

export function useDurationLogger({ userId, taskTypeId, localDate, config = DEFAULT_POINT_CONFIG }: Args) {
  const qc = useQueryClient();
  const [justLogged, setJustLogged] = useState<{ minutes: number; stars: number } | null>(null);

  const mutation = useMutation({
    mutationFn: (minutes: number) =>
      logEvent({ userId, taskTypeId, durationMin: minutes }),

    // optimistic: show the star pop immediately, before the DB confirms
    onMutate: (minutes: number) => {
      const stars = computeStars(minutes, config);
      setJustLogged({ minutes, stars });
      return { stars };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today', userId, localDate] });
      qc.invalidateQueries({ queryKey: ['week', userId] });
      qc.invalidateQueries({ queryKey: ['treats', userId] });
      qc.invalidateQueries({ queryKey: ['chips', userId, taskTypeId] }); // history changed → re-rank chips
    },
    onError: () => setJustLogged(null),     // roll back the optimistic pop
  });

  /** Single entry point the UI calls — chip tap or wheel-picker save. */
  const log = useCallback((minutes: number) => {
    if (minutes <= 0) return;
    mutation.mutate(minutes);
  }, [mutation]);

  const previewStars = useCallback(
    (minutes: number) => computeStars(minutes, config),
    [config],
  );

  return { log, previewStars, justLogged, isLogging: mutation.isPending };
}
