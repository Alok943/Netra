// ONNX Runtime Web can only run one model call at a time per page, across ALL sessions (object detector and wake
// word included); an overlapping call throws "Session already started". Every create() and run() goes through this
// first-come-first-served queue so the two never collide.
let tail: Promise<unknown> = Promise.resolve();

export function withOrt<T>(fn: () => Promise<T>): Promise<T> {
  const result = tail.then(fn, fn);
  tail = result.catch(() => {});
  return result;
}
