import { prisma } from '../config/db';

/**
 * Starts the (billed-by-the-second) encoding worker when videos are waiting and stops it when it has been idle for a
 * while, so you only pay while encoding.
 *
 * Runs inside the API process (always on). Every WORKER_POLL_SECONDS it looks at the job queue:
 *   - jobs QUEUED / RUNNING / RETRYING and the worker is not running  -> start it
 *   - no such jobs for WORKER_IDLE_MINUTES (since the last job activity) and the worker is running -> stop it
 *
 * It talks to Azure with the app's managed identity (no secrets), which has a role on the worker container only.
 * Off unless WORKER_AUTOSCALE=true, so local development never touches Azure.
 *
 * Env: WORKER_AUTOSCALE, AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, WORKER_CONTAINER_GROUP,
 *      WORKER_IDLE_MINUTES (default 10), WORKER_POLL_SECONDS (default 30).
 */
const ARM = 'https://management.azure.com';
const API_VERSION = '2023-05-01';

const config = () => ({
  enabled: process.env.WORKER_AUTOSCALE === 'true',
  subscription: process.env.AZURE_SUBSCRIPTION_ID ?? '',
  resourceGroup: process.env.AZURE_RESOURCE_GROUP ?? '',
  group: process.env.WORKER_CONTAINER_GROUP ?? '',
  idleMs: Math.max(1, Number(process.env.WORKER_IDLE_MINUTES ?? 10)) * 60_000,
  pollMs: Math.max(10, Number(process.env.WORKER_POLL_SECONDS ?? 30)) * 1000,
});

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Token for Azure Resource Manager from the Container Apps managed identity endpoint. */
const armToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 120_000) return cachedToken.value;
  const endpoint = process.env.IDENTITY_ENDPOINT;
  const header = process.env.IDENTITY_HEADER;
  if (!endpoint || !header) throw new Error('No managed identity available (IDENTITY_ENDPOINT / IDENTITY_HEADER missing)');
  const res = await fetch(`${endpoint}?resource=${encodeURIComponent(`${ARM}/`)}&api-version=2019-08-01`, {
    headers: { 'X-IDENTITY-HEADER': header },
  });
  if (!res.ok) throw new Error(`Managed identity token request failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_on: string };
  cachedToken = { value: body.access_token, expiresAt: Number(body.expires_on) * 1000 };
  return cachedToken.value;
};

const groupUrl = (c: ReturnType<typeof config>) =>
  `${ARM}/subscriptions/${c.subscription}/resourceGroups/${c.resourceGroup}/providers/Microsoft.ContainerInstance/containerGroups/${c.group}`;

const arm = async (c: ReturnType<typeof config>, method: 'GET' | 'POST', suffix = '') => {
  const res = await fetch(`${groupUrl(c)}${suffix}?api-version=${API_VERSION}`, {
    method,
    headers: { Authorization: `Bearer ${await armToken()}`, 'Content-Length': '0' },
  });
  if (!res.ok) throw new Error(`${method} ${suffix || 'group'} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
};

/** "Running", "Stopped", "Pending", ... as Azure reports it. */
const workerState = async (c: ReturnType<typeof config>): Promise<string> => {
  const body = (await (await arm(c, 'GET')).json()) as { properties?: { instanceView?: { state?: string } } };
  return body.properties?.instanceView?.state ?? 'Unknown';
};

let busy = false;
let idleSince: number | null = null;
let lastCheck = 0;
let lastState = 'Unknown';

const tick = async (c: ReturnType<typeof config>) => {
  if (busy) return;
  busy = true;
  try {
    const waiting = await prisma.mediaProcessingJob.count({
      where: { status: { in: ['QUEUED', 'RUNNING', 'RETRYING'] } },
    });

    if (waiting > 0) {
      idleSince = null;
      // Ask Azure at most once a minute while the worker is believed to be running.
      if (lastState === 'Running' && Date.now() - lastCheck < 60_000) return;
      lastState = await workerState(c);
      lastCheck = Date.now();
      if (lastState !== 'Running' && lastState !== 'Pending') {
        console.log(`[autoscale] ${waiting} job(s) waiting and the worker is ${lastState}: starting it`);
        await arm(c, 'POST', '/start');
        lastState = 'Pending';
      }
      return;
    }

    // Nothing waiting. Idle time counts from the later of: the last job activity, or when we first saw it idle.
    const activity = await prisma.mediaProcessingJob.aggregate({ _max: { completedAt: true, queuedAt: true } });
    const lastActivity = Math.max(
      activity._max.completedAt?.getTime() ?? 0,
      activity._max.queuedAt?.getTime() ?? 0,
    );
    idleSince ??= Date.now();
    const idleFor = Date.now() - Math.max(idleSince, lastActivity);
    if (idleFor < c.idleMs) return;

    lastState = await workerState(c);
    lastCheck = Date.now();
    if (lastState === 'Running') {
      console.log(`[autoscale] idle for ${Math.round(idleFor / 60_000)} min: stopping the worker`);
      await arm(c, 'POST', '/stop');
      lastState = 'Stopped';
    }
  } catch (error) {
    // Never let a hiccup (Azure or database) crash the API; the next tick tries again.
    console.error('[autoscale] check failed:', error instanceof Error ? error.message : error);
  } finally {
    busy = false;
  }
};

export const startWorkerAutoscaler = () => {
  const c = config();
  if (!c.enabled) return;
  if (!c.subscription || !c.resourceGroup || !c.group) {
    console.error('[autoscale] WORKER_AUTOSCALE is on but AZURE_SUBSCRIPTION_ID / AZURE_RESOURCE_GROUP / WORKER_CONTAINER_GROUP are not all set; not starting');
    return;
  }
  console.log(`[autoscale] watching the job queue every ${c.pollMs / 1000}s; worker "${c.group}" stops after ${c.idleMs / 60_000} idle min`);
  setInterval(() => void tick(c), c.pollMs).unref();
  void tick(c);
};
