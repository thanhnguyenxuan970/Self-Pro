import type { SQLiteDatabase } from 'expo-sqlite';
jest.mock('../src/db/client', () => ({ getDb: jest.fn() }));
import { updateChallengeNameById } from '../src/queries/useChallenge';

describe('updateChallengeNameById', () => {
  it('trims and persists only the selected user challenge', async () => {
    const db = { runAsync: jest.fn(async () => ({ changes: 1 })) } as unknown as SQLiteDatabase;

    await updateChallengeNameById(db, 5, 11, '  Ngủ trước 12h  ');

    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE challenges SET name = ? WHERE id = ? AND user_id = ?',
      ['Ngủ trước 12h', 11, 5],
    );
  });

  it('rejects a blank name before writing', async () => {
    const db = { runAsync: jest.fn() } as unknown as SQLiteDatabase;

    await expect(updateChallengeNameById(db, 5, 11, '   ')).rejects.toThrow('CHALLENGE_NAME_REQUIRED');
    expect(db.runAsync).not.toHaveBeenCalled();
  });
});
