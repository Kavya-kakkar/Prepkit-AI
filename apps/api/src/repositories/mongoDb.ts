/**
 * mongoDb.ts
 *
 * Drop-in replacement for InMemoryDb that stores everything in MongoDB.
 * The interface is identical so `authService`, `jobRunner`, `kitMutations`,
 * and all routes work without any change.
 *
 * Collections
 * ──────────────────────────────────────────────────
 *  users           { _id: userId, email, passwordHash, salt, createdAt }
 *  sessions        { _id: tokenHash, userId, expiresAt, createdAt }
 *  jobs            { _id: jobId, userId, dedupeKey, status, stage, … }
 *  kits            { _id: kitId, userId, dedupeKey, version, kit, … }
 *  practice        { _id: "userId:questionId", userId, questionId, kitId, … }
 */

import { Collection, Db } from 'mongodb';
import { User, Session, Job, KitRecord, PracticeRecord } from './types.js';

// ── Mongo document shapes (use _id instead of id) ─────────────────────────
type UserDoc = Omit<User, 'id'> & { _id: string };
type SessionDoc = Omit<Session, 'tokenHash'> & { _id: string };
type JobDoc = Omit<Job, 'id'> & { _id: string };
type KitDoc = Omit<KitRecord, 'id'> & { _id: string };
type PracticeDoc = Omit<PracticeRecord, never> & { _id: string };

// ── Helpers ────────────────────────────────────────────────────────────────
function toUser(doc: UserDoc): User {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function toJob(doc: JobDoc): Job {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function toKit(doc: KitDoc): KitRecord {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// ── Repository ─────────────────────────────────────────────────────────────
export class MongoDb {
  private users: Collection<UserDoc>;
  private sessions: Collection<SessionDoc>;
  private jobs: Collection<JobDoc>;
  private kits: Collection<KitDoc>;
  private practice: Collection<PracticeDoc>;

  constructor(db: Db) {
    this.users = db.collection<UserDoc>('users');
    this.sessions = db.collection<SessionDoc>('sessions');
    this.jobs = db.collection<JobDoc>('jobs');
    this.kits = db.collection<KitDoc>('kits');
    this.practice = db.collection<PracticeDoc>('practice');
  }

  /**
   * Create indexes once at startup.
   * Safe to call multiple times — MongoDB ignores duplicate index requests.
   */
  async ensureIndexes(): Promise<void> {
    // users: unique email lookup
    await this.users.createIndex({ email: 1 }, { unique: true });

    // sessions: TTL auto-expiry + userId lookup
    await this.sessions.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 } // MongoDB removes docs when expiresAt < now
    );
    await this.sessions.createIndex({ userId: 1 });

    // jobs: deduplication + user scoping
    await this.jobs.createIndex({ dedupeKey: 1 }, { sparse: true });
    await this.jobs.createIndex({ userId: 1, createdAt: -1 });

    // kits: deduplication + user scoping (sorted by updatedAt desc)
    await this.kits.createIndex({ dedupeKey: 1 }, { sparse: true });
    await this.kits.createIndex({ userId: 1, updatedAt: -1 });

    // practice: user + kit lookups
    await this.practice.createIndex({ userId: 1, kitId: 1 });

    console.log('[MongoDB] Indexes ensured.');
  }

  // ── Users ──────────────────────────────────────────────────────────────

  async createUser(user: User): Promise<User> {
    const { id, ...rest } = user;
    const doc: UserDoc = { _id: id, ...rest };
    try {
      await this.users.insertOne(doc);
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new Error('EMAIL_EXISTS: A user with this email already exists');
      }
      throw err;
    }
    return user;
  }

  async findUserById(id: string): Promise<User | null> {
    const doc = await this.users.findOne({ _id: id });
    return doc ? toUser(doc) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const doc = await this.users.findOne({ email: email.toLowerCase() });
    return doc ? toUser(doc) : null;
  }

  // ── Sessions ───────────────────────────────────────────────────────────

  async createSession(session: Session): Promise<Session> {
    const { tokenHash, ...rest } = session;
    await this.sessions.insertOne({ _id: tokenHash, ...rest });
    return session;
  }

  async findSession(tokenHash: string): Promise<Session | null> {
    const doc = await this.sessions.findOne({ _id: tokenHash });
    if (!doc) return null;

    // Belt-and-suspenders check (TTL index handles cleanup asynchronously)
    if (new Date() > new Date(doc.expiresAt)) {
      await this.sessions.deleteOne({ _id: tokenHash });
      return null;
    }

    return { tokenHash: doc._id, userId: doc.userId, expiresAt: doc.expiresAt, createdAt: doc.createdAt };
  }

  async deleteSession(tokenHash: string): Promise<boolean> {
    const result = await this.sessions.deleteOne({ _id: tokenHash });
    return result.deletedCount > 0;
  }

  // ── Jobs ───────────────────────────────────────────────────────────────

  async createJob(job: Job): Promise<Job> {
    const { id, ...rest } = job;
    await this.jobs.insertOne({ _id: id, ...rest });
    return job;
  }

  async findJobById(id: string): Promise<Job | null> {
    const doc = await this.jobs.findOne({ _id: id });
    return doc ? toJob(doc) : null;
  }

  async findJobByDedupe(dedupeKey: string): Promise<Job | null> {
    const doc = await this.jobs.findOne({ dedupeKey });
    return doc ? toJob(doc) : null;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | null> {
    const { id: _dropId, ...safeUpdates } = updates as any;
    const now = new Date().toISOString();

    const result = await this.jobs.findOneAndUpdate(
      { _id: id },
      { $set: { ...safeUpdates, updatedAt: now } },
      { returnDocument: 'after' }
    );
    return result ? toJob(result) : null;
  }

  // ── Kits ───────────────────────────────────────────────────────────────

  async createKit(record: KitRecord): Promise<KitRecord> {
    const { id, ...rest } = record;
    await this.kits.insertOne({ _id: id, ...rest });
    return record;
  }

  async findKitById(id: string): Promise<KitRecord | null> {
    const doc = await this.kits.findOne({ _id: id });
    return doc ? toKit(doc) : null;
  }

  async findKitByDedupe(dedupeKey: string): Promise<KitRecord | null> {
    const doc = await this.kits.findOne({ dedupeKey });
    return doc ? toKit(doc) : null;
  }

  async listKitsByUser(userId: string): Promise<KitRecord[]> {
    const docs = await this.kits
      .find({ userId })
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(toKit);
  }

  async updateKit(id: string, updates: Partial<KitRecord>): Promise<KitRecord | null> {
    const { id: _dropId, ...safeUpdates } = updates as any;
    const now = new Date().toISOString();

    // CAS: if the caller passes a version, enforce it to prevent lost-update races
    const filter: Record<string, any> = { _id: id };
    if (safeUpdates.version !== undefined) {
      // Increment by 1 from the expected prior version
      filter.version = safeUpdates.version - 1;
    }

    const result = await this.kits.findOneAndUpdate(
      filter,
      { $set: { ...safeUpdates, updatedAt: now } },
      { returnDocument: 'after' }
    );

    if (!result) {
      // Either not found, or version mismatch (CAS conflict)
      return null;
    }
    return toKit(result);
  }

  // ── Practice ───────────────────────────────────────────────────────────

  async getPracticeRecord(userId: string, questionId: string): Promise<PracticeRecord | null> {
    const key = `${userId}:${questionId}`;
    const doc = await this.practice.findOne({ _id: key });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as PracticeRecord;
  }

  async savePracticeRecord(record: PracticeRecord): Promise<PracticeRecord> {
    const key = `${record.userId}:${record.questionId}`;
    await this.practice.replaceOne(
      { _id: key },
      { _id: key, ...record } as any,
      { upsert: true }
    );
    return record;
  }

  async listPracticeByUser(userId: string, kitId?: string): Promise<PracticeRecord[]> {
    const filter: Record<string, any> = { userId };
    if (kitId) filter.kitId = kitId;
    const docs = await this.practice.find(filter).toArray();
    return docs.map(({ _id, ...rest }) => rest as PracticeRecord);
  }
}
