import { describeError } from '@/lib/errors/describeError';
import * as FS from './fs';
import type { DownloadMeta, DownloadRecord, DownloadStatus } from './types';

// Downloads belong to the signed-in ACCOUNT, not the phone: each account gets its own folder and list, so signing
// into another account never shows (or plays) the previous one's downloads. They come back when that account
// signs in again. (Files from before this change sit loose in downloads/ and are no longer listed.)
let account: string | null = null;
let DIR = '';
let MANIFEST = '';
const PROGRESS_THROTTLE_MS = 250;
const IN_FLIGHT: DownloadStatus[] = ['queued', 'downloading'];

type Listener = () => void;

let records: DownloadRecord[] = [];
let hydrated = false;
let hydrating: Promise<void> | null = null;
let snapshot = { ready: false, records };
const listeners = new Set<Listener>();

// In-memory only: how to get a fresh signed URL for a queued video, the running transfers, and flags for aborts we caused.
const jobs = new Map<string, () => Promise<string>>();
const running = new Map<string, FS.DownloadResumable>();
const userCancelled = new Set<string>();
const outOfSpace = new Set<string>();
let pumping = false;

const emit = () => {
  snapshot = { ready: hydrated, records };
  listeners.forEach((listener) => listener());
};

// Writes are chained so two quick updates can't interleave.
let saving: Promise<unknown> = Promise.resolve();
const save = () => {
  saving = saving
    .then(() => FS.writeAsStringAsync(MANIFEST, JSON.stringify(records)))
    .catch(() => undefined);
};

const patch = (
  videoId: string,
  change: Partial<DownloadRecord>,
  persist = true,
) => {
  records = records.map((record) =>
    record.videoId === videoId ? { ...record, ...change } : record,
  );
  emit();
  if (persist) save();
};

const ensureDir = async () => {
  const info = await FS.getInfoAsync(DIR);
  if (!info.exists) await FS.makeDirectoryAsync(DIR, { intermediates: true });
};

const extensionOf = (url: string) =>
  /\.([a-z0-9]{2,4})$/i.exec(url.split('?')[0])?.[1]?.toLowerCase() ?? null;

const remove_ = (uri: string | null | undefined) =>
  uri
    ? FS.deleteAsync(uri, { idempotent: true }).catch(() => undefined)
    : Promise.resolve();

const hydrate = () =>
  (hydrating ??= (async () => {
    const mine = account;
    if (!mine) {
      // Signed out: nothing to show.
      hydrated = true;
      emit();
      return;
    }
    try {
      await ensureDir();
      const info = await FS.getInfoAsync(MANIFEST);
      if (info.exists) {
        const stored = JSON.parse(
          await FS.readAsStringAsync(MANIFEST),
        ) as DownloadRecord[];
        const restored: DownloadRecord[] = [];
        for (const record of stored) {
          if (record.status === 'completed') {
            // The OS can clear app storage; drop entries whose file is gone.
            const file = record.fileUri
              ? await FS.getInfoAsync(record.fileUri)
              : null;
            if (file?.exists) restored.push(record);
          } else if (IN_FLIGHT.includes(record.status)) {
            // The app was closed mid-download. We don't resume partial files, so offer a retry.
            restored.push({
              ...record,
              status: 'failed',
              progress: 0,
              error: 'Interrupted. Tap retry to download again.',
            });
          } else {
            restored.push(record);
          }
        }
        // The account changed while we were reading: these belong to someone else now.
        if (mine !== account) return;
        const restoredIds = new Set(restored.map((r) => r.videoId));
        records = [
          ...records.filter((r) => !restoredIds.has(r.videoId)),
          ...restored,
        ];
      }
    } catch {
      // Unreadable manifest: start empty rather than blocking the screen.
    } finally {
      if (mine === account) {
        hydrated = true;
        emit();
        save();
      }
    }
  })());

const process = async (record: DownloadRecord) => {
  const id = record.videoId;
  patch(id, { status: 'downloading', progress: 0, error: undefined });
  let tmpUri: string | null = null;

  try {
    await ensureDir();
    const url = await jobs.get(id)!();
    const finalUri = `${DIR}${id}.${extensionOf(url) ?? 'mp4'}`;
    tmpUri = `${finalUri}.part`;

    let lastEmit = 0;
    let checkedSpace = false;
    const resumable: FS.DownloadResumable = FS.createDownloadResumable(
      url,
      tmpUri,
      {},
      (p) => {
        const total = p.totalBytesExpectedToWrite;
        if (!checkedSpace && total > 0) {
          checkedSpace = true;
          // Abort early if the file can't possibly fit, instead of failing after filling the disk.
          FS.getFreeDiskStorageAsync()
            .then((free) => {
              if (total > free) {
                outOfSpace.add(id);
                resumable.cancelAsync().catch(() => undefined);
              }
            })
            .catch(() => undefined);
        }
        const now = Date.now();
        if (total > 0 && now - lastEmit >= PROGRESS_THROTTLE_MS) {
          lastEmit = now;
          patch(id, { progress: p.totalBytesWritten / total }, false);
        }
      },
    );

    running.set(id, resumable);
    const result = await resumable.downloadAsync();
    running.delete(id);

    if (userCancelled.has(id)) {
      patch(id, { status: 'cancelled', progress: 0 });
      return;
    }
    if (outOfSpace.has(id)) {
      patch(id, {
        status: 'failed',
        progress: 0,
        error: 'Not enough storage on this device.',
      });
      return;
    }
    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(
        result
          ? `The server refused the download (${result.status}).`
          : 'The download was interrupted.',
      );
    }

    await FS.moveAsync({ from: tmpUri, to: finalUri });
    tmpUri = null;
    const file = await FS.getInfoAsync(finalUri);

    // Keep a local copy of the thumbnail so the list still has pictures offline (best effort).
    let thumbnailLocalUri: string | null = null;
    if (record.thumbnailUrl) {
      try {
        const thumbUri = `${DIR}${id}.jpg`;
        const thumb = await FS.downloadAsync(record.thumbnailUrl, thumbUri);
        if (thumb.status >= 200 && thumb.status < 300)
          thumbnailLocalUri = thumbUri;
        else await remove_(thumbUri);
      } catch {
        // thumbnail is optional
      }
    }

    patch(id, {
      status: 'completed',
      progress: 1,
      fileUri: finalUri,
      sizeBytes: file.exists ? file.size : null,
      thumbnailLocalUri,
    });
  } catch (error) {
    running.delete(id);
    if (userCancelled.has(id)) patch(id, { status: 'cancelled', progress: 0 });
    else
      patch(id, {
        status: 'failed',
        progress: 0,
        error: describeError(error).message,
      });
  } finally {
    userCancelled.delete(id);
    outOfSpace.delete(id);
    jobs.delete(id);
    await remove_(tmpUri);
  }
};

/** One transfer at a time, in the order they were queued (oldest first). */
const pump = async () => {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const next = [...records]
        .reverse()
        .find((record) => record.status === 'queued');
      if (!next) break;
      await process(next);
    }
  } finally {
    pumping = false;
  }
};

export const downloadStore = {
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => snapshot,
  hydrate,

  /** Switch to an account's own downloads (or to none when signed out). Call whenever the signed-in user changes. */
  setUser: (userId: string | null) => {
    if (userId === account) return;
    // The previous account's transfers must not keep running (or finish into the new account's list).
    running.forEach((resumable, id) => {
      userCancelled.add(id);
      resumable.cancelAsync().catch(() => undefined);
    });
    jobs.clear();
    account = userId;
    DIR = userId ? `${FS.documentDirectory}downloads/${userId}/` : '';
    MANIFEST = userId ? `${DIR}index.json` : '';
    records = [];
    hydrated = false;
    hydrating = null;
    emit();
    if (userId) void hydrate();
  },

  /** Queue a download. `resolveUrl` fetches a fresh signed link when this item's turn arrives. */
  enqueue: async (meta: DownloadMeta, resolveUrl: () => Promise<string>) => {
    if (!account) return; // downloads are per account: nobody signed in, nowhere to put it
    await hydrate();
    const existing = records.find((record) => record.videoId === meta.videoId);
    if (
      existing &&
      (existing.status === 'completed' || IN_FLIGHT.includes(existing.status))
    )
      return;

    const fresh: DownloadRecord = {
      ...meta,
      status: 'queued',
      progress: 0,
      fileUri: null,
      thumbnailLocalUri: existing?.thumbnailLocalUri ?? null,
      sizeBytes: null,
      createdAt: Date.now(),
    };
    records = existing
      ? records.map((record) =>
          record.videoId === meta.videoId ? fresh : record,
        )
      : [fresh, ...records];
    jobs.set(meta.videoId, resolveUrl);
    emit();
    save();
    void pump();
  },

  cancel: (videoId: string) => {
    const record = records.find((r) => r.videoId === videoId);
    if (!record) return;
    if (record.status === 'queued') {
      jobs.delete(videoId);
      patch(videoId, { status: 'cancelled', progress: 0 });
    } else if (record.status === 'downloading') {
      userCancelled.add(videoId);
      running
        .get(videoId)
        ?.cancelAsync()
        .catch(() => undefined);
    }
  },

  remove: async (videoId: string) => {
    downloadStore.cancel(videoId);
    const record = records.find((r) => r.videoId === videoId);
    records = records.filter((r) => r.videoId !== videoId);
    emit();
    save();
    if (record)
      await Promise.all([
        remove_(record.fileUri),
        remove_(record.thumbnailLocalUri),
      ]);
  },
};
