import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Lets the worker cancel a running job (because the creator deleted the video) without passing a signal through every
 * function: the worker runs each job inside `jobContext.run({ signal }, ...)`, and the encoding code looks the signal
 * up here. Outside a job (scripts, tests) there is no signal and nothing is ever cancelled.
 */
export class JobCancelledError extends Error {
  constructor(message = 'Job cancelled: the video was deleted') {
    super(message);
    this.name = 'JobCancelledError';
  }
}

export const jobContext = new AsyncLocalStorage<{ signal: AbortSignal }>();

export const currentSignal = (): AbortSignal | undefined => jobContext.getStore()?.signal;

export const isCancelled = (error: unknown) => error instanceof JobCancelledError || (error as Error | undefined)?.name === 'AbortError';

/** Call between steps of a long job. Throws if the job was cancelled. */
export const throwIfCancelled = () => {
  if (currentSignal()?.aborted) throw new JobCancelledError();
};

type KillableCommand = {
  on(event: string, listener: (...args: any[]) => void): unknown;
  run(): void;
  kill(signal?: string): unknown;
};

/**
 * Runs a fluent-ffmpeg command to the end. If the current job is cancelled meanwhile, ffmpeg is killed at once (so a
 * deleted video stops burning CPU) and this rejects with JobCancelledError.
 */
export const runCommand = (command: KillableCommand, describe: string) =>
  new Promise<void>((resolve, reject) => {
    const signal = currentSignal();
    if (signal?.aborted) return reject(new JobCancelledError());

    const onAbort = () => {
      try {
        command.kill('SIGKILL');
      } catch {
        // already finished
      }
      reject(new JobCancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const done = () => signal?.removeEventListener('abort', onAbort);

    command.on('end', () => {
      done();
      resolve();
    });
    command.on('error', (err: Error) => {
      done();
      reject(signal?.aborted ? new JobCancelledError() : new Error(`${describe}: ${err.message}`));
    });
    command.run();
  });
