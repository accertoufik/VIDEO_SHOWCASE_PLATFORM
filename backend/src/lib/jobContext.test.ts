import { expect, test } from 'bun:test';
import { JobCancelledError, jobContext, runCommand, throwIfCancelled } from './jobContext';

// A stand-in for a fluent-ffmpeg command that "runs" until it is killed or told to finish.
const fakeCommand = () => {
  const handlers: Record<string, (...a: any[]) => void> = {};
  let killed = false;
  return {
    on(event: string, cb: (...a: any[]) => void) {
      handlers[event] = cb;
      return this;
    },
    run() {},
    kill() {
      killed = true;
      handlers.error?.(new Error('ffmpeg was killed'));
    },
    finish: () => handlers.end?.(),
    wasKilled: () => killed,
  };
};

test('outside a job nothing is ever cancelled', () => {
  expect(() => throwIfCancelled()).not.toThrow();
});

test('a command finishes normally when the job is not cancelled', async () => {
  const c = fakeCommand();
  const controller = new AbortController();
  const p = jobContext.run({ signal: controller.signal }, () => runCommand(c, 'test'));
  c.finish();
  await p;
  expect(c.wasKilled()).toBe(false);
});

test('cancelling the job kills the running command and rejects with JobCancelledError', async () => {
  const c = fakeCommand();
  const controller = new AbortController();
  const p = jobContext.run({ signal: controller.signal }, () => runCommand(c, 'test'));
  controller.abort();
  await expect(p).rejects.toBeInstanceOf(JobCancelledError);
  expect(c.wasKilled()).toBe(true);
});

test('an already-cancelled job never starts the command', async () => {
  const c = fakeCommand();
  const controller = new AbortController();
  controller.abort();
  await expect(jobContext.run({ signal: controller.signal }, () => runCommand(c, 'test'))).rejects.toBeInstanceOf(JobCancelledError);
  expect(c.wasKilled()).toBe(false);
});

test('throwIfCancelled throws inside a cancelled job', () => {
  const controller = new AbortController();
  controller.abort();
  jobContext.run({ signal: controller.signal }, () => expect(() => throwIfCancelled()).toThrow(JobCancelledError));
});

test('a real ffmpeg error inside a live job keeps its message', async () => {
  const handlers: Record<string, (...a: any[]) => void> = {};
  const failing = {
    on(event: string, cb: (...a: any[]) => void) {
      handlers[event] = cb;
      return this;
    },
    run() {
      handlers.error?.(new Error('bad input'));
    },
    kill() {},
  };
  const controller = new AbortController();
  await expect(jobContext.run({ signal: controller.signal }, () => runCommand(failing, 'encode 720p'))).rejects.toThrow('encode 720p: bad input');
});
