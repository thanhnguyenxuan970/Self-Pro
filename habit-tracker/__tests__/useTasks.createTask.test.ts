import type { SQLiteDatabase } from 'expo-sqlite';
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));
import { getDb } from '../src/db/client';
import { useCreateTask } from '../src/queries/useTasks';

type Mutation = { mutationFn: (params: {
  name: string; kind: 'GOOD' | 'BAD'; isTimeBased: boolean; basePoints: number; starPenalty: number;
}) => Promise<number> };

function createDb(existing: { id: number; name: string }[], newTaskId = 7) {
  const getAllAsync = jest.fn(async () => existing);
  const getFirstAsync = jest.fn(async () => ({ id: newTaskId }));
  const runAsync = jest.fn(async () => ({ changes: 1 }));
  return { getAllAsync, getFirstAsync, runAsync } as unknown as SQLiteDatabase;
}

describe('useCreateTask -- normalized-name duplicate guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a new task whose name collides with an existing one after normalization', async () => {
    const db = createDb([{ id: 1, name: 'doc sach' }]);
    jest.mocked(getDb).mockResolvedValue(db);

    const mutation = useCreateTask(5) as unknown as Mutation;

    await expect(mutation.mutationFn({ name: 'Đọc sách', kind: 'GOOD', isTimeBased: false, basePoints: 5, starPenalty: 0 }))
      .rejects.toThrow('DUPLICATE_ACTIVITY_NAME');
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('allows re-creating/restoring the exact same task name (upsert path)', async () => {
    const db = createDb([{ id: 1, name: 'Đọc sách' }]);
    jest.mocked(getDb).mockResolvedValue(db);

    const mutation = useCreateTask(5) as unknown as Mutation;

    const id = await mutation.mutationFn({ name: 'Đọc sách', kind: 'GOOD', isTimeBased: false, basePoints: 5, starPenalty: 0 });
    expect(id).toBe(7);
    expect(db.runAsync).toHaveBeenCalled();
  });

  it('allows a genuinely new, non-colliding name', async () => {
    const db = createDb([{ id: 1, name: 'Chạy bộ' }]);
    jest.mocked(getDb).mockResolvedValue(db);

    const mutation = useCreateTask(5) as unknown as Mutation;

    const id = await mutation.mutationFn({ name: 'Bơi lội', kind: 'GOOD', isTimeBased: false, basePoints: 5, starPenalty: 0 });
    expect(id).toBe(7);
    expect(db.runAsync).toHaveBeenCalled();
  });
});
