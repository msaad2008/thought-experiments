// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { afterUnpaused, capturePointer } from './play-helpers';

afterEach(() => vi.useRealTimers());

test('capturePointer survives a pointer that is already gone', () => {
  const el = document.createElement('div');
  el.setPointerCapture = () => {
    throw new DOMException('gone', 'NotFoundError');
  };
  expect(() => capturePointer(el, 1)).not.toThrow();
});

test('afterUnpaused holds the callback while paused, and can be cancelled', () => {
  vi.useFakeTimers();
  let paused = false;
  const fn = vi.fn();
  afterUnpaused(1000, () => paused, fn);
  vi.advanceTimersByTime(999);
  paused = true;
  vi.advanceTimersByTime(3000);
  expect(fn).not.toHaveBeenCalled();
  paused = false;
  vi.advanceTimersByTime(200);
  expect(fn).toHaveBeenCalledTimes(1);

  const later = vi.fn();
  const cancel = afterUnpaused(1000, () => false, later);
  cancel();
  vi.advanceTimersByTime(2000);
  expect(later).not.toHaveBeenCalled();
});
