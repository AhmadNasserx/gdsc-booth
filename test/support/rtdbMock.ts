/**
 * In-memory stand-in for the Realtime Database Admin API used by the routes.
 *
 * It follows the real database where the app depends on it:
 * - set() throws on undefined values, as the Admin SDK does.
 * - Empty arrays and objects, and nulls, are not stored. Reading them back gives nothing.
 * - transaction() passes the value it believes is current. If that value is stale (for example
 *   a cache miss shows null), the write is rejected and the callback runs again with the server
 *   value. Returning undefined aborts. With simulateCacheMisses() the first pass sees null.
 *
 * Test files reach this through jest.mock('@/lib/firebaseAdmin', ...). It lives outside
 * __tests__ so Jest does not treat it as a suite.
 */

type Tree = Record<string, unknown>;

let root: Tree = {};
let cacheMisses = false;

export function resetDb(): void {
  root = {};
  cacheMisses = false;
}

/** When on, the first pass of every transaction sees null, as a client with an empty cache would. */
export function simulateCacheMisses(on: boolean): void {
  cacheMisses = on;
}

/** Test clock. installClock() routes Date.now() through it. */
export const clock = { now: 1_700_000_000_000 };

export function installClock(): void {
  jest.spyOn(Date, 'now').mockImplementation(() => clock.now);
}

function segments(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function assertNoUndefined(value: unknown, where: string): void {
  if (value === undefined) {
    throw new Error(`first argument contains undefined in property '${where}'`);
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) assertNoUndefined(child, `${where}.${key}`);
  }
}

/** Removes null, undefined and empty containers, the way the database does on storage. */
function prune(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const out = value.map(prune);
    return out.some((v) => v !== undefined) ? out.map((v) => (v === undefined ? null : v)) : undefined;
  }
  if (typeof value === 'object') {
    const out: Tree = {};
    for (const [key, child] of Object.entries(value)) {
      const pruned = prune(child);
      if (pruned !== undefined) out[key] = pruned;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return value;
}

function readRaw(path: string): unknown {
  let node: unknown = root;
  for (const key of segments(path)) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Current value at a path. Missing paths read as null. */
export function readPath(path: string): unknown {
  const value = readRaw(path);
  return value === undefined ? null : clone(value);
}

function writeRaw(path: string, value: unknown): void {
  const keys = segments(path);
  if (keys.length === 0) {
    root = (value && typeof value === 'object' ? (value as Tree) : {});
    return;
  }
  const last = keys.pop() as string;
  let node: Tree = root;
  for (const key of keys) {
    const child = node[key];
    if (child === null || typeof child !== 'object') {
      if (value === null || value === undefined) return;
      node[key] = {};
    }
    node = node[key] as Tree;
  }
  if (value === null || value === undefined) delete node[last];
  else node[last] = value;
  root = (prune(root) as Tree | undefined) ?? {};
}

/** Writes a value at a path, or deletes it when value is null. */
export function writePath(path: string, value: unknown): void {
  writeRaw(path, value === null ? null : clone(value));
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

async function runTransaction(path: string, update: (current: unknown) => unknown): Promise<{ committed: boolean }> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const actual = readPath(path);
    const seen = attempt === 0 && cacheMisses ? null : actual;
    const next = update(clone(seen));
    if (next === undefined) return { committed: false };
    if (!sameJson(seen, actual)) continue; // stale: the server would reject and send the real value
    assertNoUndefined(next, path);
    writePath(path, next);
    return { committed: true };
  }
  return { committed: false };
}

function refFor(path: string) {
  return {
    async get() {
      const value = readPath(path);
      return { val: () => clone(value) };
    },
    async set(value: unknown) {
      assertNoUndefined(value, path);
      writePath(path, value);
    },
    child(key: string) {
      return refFor(`${path}/${key}`);
    },
    async remove() {
      writePath(path, null);
    },
    transaction(update: (current: unknown) => unknown) {
      return runTransaction(path, update);
    },
  };
}

export const adminDbMock = {
  ref: (path: string) => refFor(path),
};
