/**
 * db.ts — single import point for the active database repository.
 *
 * Services and routes import `db` from here.  During normal server operation
 * the MongoDb instance is set by index.ts before any request is served.
 * Tests can call `setDb()` to inject a fake or InMemoryDb instance.
 */

import type { MongoDb } from './mongoDb.js';
import type { InMemoryDb } from './inMemoryDb.js';

export type AnyDb = MongoDb | InMemoryDb;

let _db: AnyDb | null = null;

/** Called once at startup (index.ts) with the live MongoDb instance. */
export function setDb(instance: AnyDb): void {
  _db = instance;
}

/**
 * Returns the active db instance.
 * Throws if called before setDb() — this is intentional: it means
 * a route was hit before the database finished connecting.
 */
export function getDb(): AnyDb {
  if (!_db) {
    throw new Error(
      '[db] Database not initialised. ' +
        'Ensure setDb() is called in index.ts before the server starts.'
    );
  }
  return _db;
}

/**
 * Proxy object — safe to destructure in module scope.
 * Delegates every call to the live instance at call-time, not import-time.
 */
export const db = new Proxy({} as AnyDb, {
  get(_target, prop: string) {
    return (getDb() as any)[prop].bind(getDb());
  },
});
