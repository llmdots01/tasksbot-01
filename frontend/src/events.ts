/** App-wide signal that tasks or settings changed outside the current page (e.g. by the AI assistant). */
const EVENT = "taskaido:data-changed";

export function emitDataChanged() {
  window.dispatchEvent(new Event(EVENT));
}

/** Subscribe; returns an unsubscribe function (usable directly as a useEffect cleanup). */
export function onDataChanged(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
