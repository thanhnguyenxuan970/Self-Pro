test('pendingLogTaskIds ref blocks concurrent same-task calls', async () => {
  const pendingIds = { current: new Set<number>() };
  let callCount = 0;
  async function handleLog(taskId: number) {
    if (pendingIds.current.has(taskId)) return;
    pendingIds.current.add(taskId);
    try {
      callCount++;
      await new Promise(r => setTimeout(r, 50));
    } finally {
      pendingIds.current.delete(taskId);
    }
  }
  await Promise.all([handleLog(1), handleLog(1)]);
  expect(callCount).toBe(1);
});
