import { requestAddActivity, subscribeAddActivityIntent } from '../src/hooks/useAddActivityIntent';

describe('useAddActivityIntent pub/sub', () => {
  it('delivers the intent to a subscribed listener', () => {
    const listener = jest.fn();
    subscribeAddActivityIntent(listener);

    requestAddActivity({ name: 'Đọc sách' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ name: 'Đọc sách' });
  });

  it('delivers the same intent to every subscribed listener', () => {
    const listenerA = jest.fn();
    const listenerB = jest.fn();
    subscribeAddActivityIntent(listenerA);
    subscribeAddActivityIntent(listenerB);

    requestAddActivity({ name: 'Chạy bộ' });

    expect(listenerA).toHaveBeenCalledWith({ name: 'Chạy bộ' });
    expect(listenerB).toHaveBeenCalledWith({ name: 'Chạy bộ' });
  });

  it('stops delivering to a listener after its unsubscribe function is called', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAddActivityIntent(listener);

    unsubscribe();
    requestAddActivity({ name: 'Thiền' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('requestAddActivity with no subscribers does not throw', () => {
    expect(() => requestAddActivity({ name: 'Uống nước' })).not.toThrow();
  });
});
