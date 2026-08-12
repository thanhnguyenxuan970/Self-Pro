type AddActivityIntent = { name: string; taskTypeId?: number | null };
type Listener = (intent: AddActivityIntent) => void;

const listeners = new Set<Listener>();

/** Cross-screen trigger to open the globally-mounted AddActivitySheet with a
 *  preset task pre-filled. AddActivitySheet resolves the exact existing task
 *  by taskTypeId when the caller already knows it (e.g. a challenge's linked
 *  habit) — falling back to a name match otherwise — so two tasks whose names
 *  collide after diacritic/case normalization can't cause the wrong one to be
 *  selected. Mirrors the app's existing queryClient-singleton pattern for
 *  cross-screen coordination — no new state-management dependency. */
export function requestAddActivity(intent: AddActivityIntent): void {
  listeners.forEach(listener => listener(intent));
}

export function subscribeAddActivityIntent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
