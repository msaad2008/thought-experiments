// Small helpers shared by the game play views.

/** Pointer capture, when the browser still allows it: it throws once the pointer has already gone (a very quick tap). */
export function capturePointer(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // the drag or aim still works without capture
  }
}

/**
 * Like setTimeout, but when the time is up while the game is paused (Physics panel open)
 * or the page is hidden, the callback waits until play resumes. Returns a cancel function.
 */
export function afterUnpaused(ms: number, paused: () => boolean, fn: () => void): () => void {
  let id = 0;
  const tick = () => {
    if (paused() || document.hidden) id = window.setTimeout(tick, 200);
    else fn();
  };
  id = window.setTimeout(tick, ms);
  return () => clearTimeout(id);
}
