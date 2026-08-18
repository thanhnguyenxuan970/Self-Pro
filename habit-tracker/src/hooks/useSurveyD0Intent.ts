type Listener = () => void;

const listeners = new Set<Listener>();

/** Cross-screen trigger fired by useLogTask's onSuccess (src/queries/useToday.ts)
 *  when a user's very first-ever activity_log row lands — whether logged via
 *  TodayScreen's own tap-to-log or the globally-mounted AddActivitySheet
 *  (opened from any tab's FAB). TodayScreen subscribes and shows the D0
 *  survey shortly after. Mirrors useAddActivityIntent's pub/sub pattern —
 *  same class of cross-screen coordination problem, same solution. */
export function notifyFirstEverLog(): void {
  listeners.forEach(listener => listener());
}

export function subscribeFirstEverLog(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
