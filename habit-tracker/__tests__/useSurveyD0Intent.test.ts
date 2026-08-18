import { notifyFirstEverLog, subscribeFirstEverLog } from '../src/hooks/useSurveyD0Intent';

describe('useSurveyD0Intent pub/sub', () => {
  it('delivers the notification to a subscribed listener', () => {
    const listener = jest.fn();
    subscribeFirstEverLog(listener);

    notifyFirstEverLog();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('delivers to every subscribed listener', () => {
    const listenerA = jest.fn();
    const listenerB = jest.fn();
    subscribeFirstEverLog(listenerA);
    subscribeFirstEverLog(listenerB);

    notifyFirstEverLog();

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeFirstEverLog(listener);

    unsubscribe();
    notifyFirstEverLog();

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifying with no subscribers does not throw', () => {
    expect(() => notifyFirstEverLog()).not.toThrow();
  });
});
