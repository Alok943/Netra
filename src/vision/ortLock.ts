// ONNX Runtime Web can only run one model call at a time per page, across ALL sessions (object detector and wake
// word included); an overlapping call throws "Session already started". Every create() and run() goes through this
// queue so the two never collide.
//
// "high" jobs (the wake word: three tiny models every 80 ms) jump ahead of waiting "normal" jobs (the object detector,
// 100+ ms per frame). With a plain first-come queue the wake word fell further behind on every detector frame, so its
// audio backlog grew without limit and "Hey Netra" fired seconds late, or never.
type Priority = "normal" | "high";

interface Job {
  fn: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  high: boolean;
}

const queue: Job[] = [];
let busy = false;

async function pump(): Promise<void> {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      job.resolve(await job.fn());
    } catch (err) {
      job.reject(err);
    }
  }
  busy = false;
}

export function withOrt<T>(fn: () => Promise<T>, priority: Priority = "normal"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job: Job = { fn, resolve: resolve as (v: unknown) => void, reject, high: priority === "high" };
    if (job.high) {
      // After any other waiting high jobs (keeps audio in order), before every normal one.
      const firstNormal = queue.findIndex((j) => !j.high);
      if (firstNormal < 0) queue.push(job);
      else queue.splice(firstNormal, 0, job);
    } else {
      queue.push(job);
    }
    void pump();
  });
}
