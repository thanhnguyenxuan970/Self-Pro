jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('store review native-module compatibility', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-store-review');
  });

  test('does not crash when the installed binary lacks expo-store-review', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('expo-store-review', () => {
        throw new Error('native module unavailable');
      });

      const isolatedStoreReview = await import('../src/lib/storeReview');
      await expect(isolatedStoreReview.requestStoreReview()).resolves.toBeUndefined();
    });
  });
});
