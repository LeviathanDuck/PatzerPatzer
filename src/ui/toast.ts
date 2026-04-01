// Minimal toast notification for brief user-facing confirmations.
// Uses direct DOM manipulation (outside Snabbdom's tree) to keep
// implementation self-contained and avoid coupling to redraw().

const TOAST_ID = 'pp-toast';

let _dismissTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Show a brief toast message at the bottom of the screen.
 * Auto-dismisses after durationMs (default 2000ms).
 * Calling again before dismissal resets the timer and updates the message.
 */
export function showToast(message: string, durationMs = 2000): void {
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = TOAST_ID;
    el.className = 'pp-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.remove('pp-toast--hidden');
  el.classList.add('pp-toast--visible');

  clearTimeout(_dismissTimer);
  _dismissTimer = setTimeout(() => {
    if (el) {
      el.classList.remove('pp-toast--visible');
      el.classList.add('pp-toast--hidden');
    }
  }, durationMs);
}
