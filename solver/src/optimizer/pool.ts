import { Worker } from 'node:worker_threads';

/** A fixed set of worker threads running tasks from one script; results come back in task order. */
export class Pool<T, R> {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: { id: number; task: T }[] = [];
  private pending = new Map<number, (r: R) => void>();
  private nextId = 0;

  constructor(script: URL, size: number) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(script);
      w.on('message', ({ id, result }: { id: number; result: R }) => {
        this.pending.get(id)!(result);
        this.pending.delete(id);
        this.idle.push(w);
        this.pump();
      });
      w.on('error', (e) => {
        console.error(e);
        process.exit(1);
      });
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  run(tasks: T[]): Promise<R[]> {
    return Promise.all(tasks.map((task) => new Promise<R>((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.queue.push({ id, task });
      this.pump();
    })));
  }

  private pump() {
    while (this.idle.length && this.queue.length) this.idle.pop()!.postMessage(this.queue.shift()!);
  }

  close() {
    for (const w of this.workers) void w.terminate();
  }
}
