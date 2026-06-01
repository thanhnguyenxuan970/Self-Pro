// Duration-based activity logging: chip presets + optimistic star preview.

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getChipPresets } from '../logic/chipPresets';
import { computeStars, DEFAULT_POINT_CONFIG, type PointConfig } from '../logic/points';
import { useLogTask } from './useToday';

interface DurationLoggerArgs {
  userId: number;
  task: {
    id: number;
    kind: string;
    is_time_based: number;
    base_points: number;
    star_penalty: number;
  };
  config?: PointConfig;
  onSuccess?: (minutes: number, stars: number) => void;
  onError?: () => void;
}

export function useChipPresets(userId: number, taskTypeId: number, enabled = true) {
  return useQuery({
    queryKey: ['chips', userId, taskTypeId],
    queryFn: () => getChipPresets(userId, taskTypeId),
    enabled: enabled && userId > 0 && taskTypeId > 0,
    staleTime: 60_000,
  });
}

export function useDurationLogger({
  userId,
  task,
  config = DEFAULT_POINT_CONFIG,
  onSuccess,
  onError,
}: DurationLoggerArgs) {
  const qc = useQueryClient();
  const logTask = useLogTask(userId);
  const [justLogged, setJustLogged] = useState<{ minutes: number; stars: number } | null>(null);

  const log = useCallback(
    (minutes: number) => {
      if (minutes <= 0) return;
      const stars = computeStars(minutes, config);
      setJustLogged({ minutes, stars });
      logTask.mutate(
        {
          taskTypeId: task.id,
          kind: task.kind as 'GOOD' | 'BAD',
          isTimeBased: !!task.is_time_based,
          basePoints: task.base_points,
          starPenalty: task.star_penalty,
          durationMin: minutes,
        },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['chips', userId, task.id] });
            onSuccess?.(minutes, stars);
          },
          onError: () => {
            setJustLogged(null);
            onError?.();
          },
        },
      );
    },
    [logTask, task, config, userId, qc, onSuccess, onError],
  );

  const previewStars = useCallback(
    (minutes: number) => computeStars(minutes, config),
    [config],
  );

  return { log, previewStars, justLogged, isLogging: logTask.isPending };
}
