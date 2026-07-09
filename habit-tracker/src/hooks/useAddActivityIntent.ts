type AddActivityIntent = { name: string };
type Listener = (intent: AddActivityIntent) => void;

const listeners = new Set<Listener>();

/** Cross-screen trigger to open the globally-mounted AddActivitySheet with a
 *  preset task name pre-filled. AddActivitySheet resolves tasks by
 *  (user_id, name) — see useCreateTask's ON CONFLICT upsert — so passing the
 *  linked habit's name (not its id) reuses that existing find-or-create path
 *  instead of adding a second lookup. Mirrors the app's existing
 *  queryClient-singleton pattern for cross-screen coordination — no new
 *  state-management dependency. */
export function requestAddActivity(intent: AddActivityIntent): void {
  listeners.forEach(listener => listener(intent));
}

export function subscribeAddActivityIntent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
