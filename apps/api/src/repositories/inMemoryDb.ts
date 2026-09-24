import { User, Session, Job, KitRecord, PracticeRecord } from './types.js';

export class InMemoryDb {
  private users = new Map<string, User>();
  private usersByEmail = new Map<string, string>(); // email -> userId

  private sessions = new Map<string, Session>(); // tokenHash -> Session

  private jobs = new Map<string, Job>();
  private jobsByDedupe = new Map<string, string>(); // dedupeKey -> jobId

  private kits = new Map<string, KitRecord>(); // kitId -> KitRecord
  private kitsByDedupe = new Map<string, string>(); // dedupeKey -> kitId

  private practice = new Map<string, PracticeRecord>(); // `${userId}:${questionId}` -> PracticeRecord

  // --- Users ---
  async createUser(user: User): Promise<User> {
    const lowerEmail = user.email.toLowerCase();
    if (this.usersByEmail.has(lowerEmail)) {
      throw new Error('EMAIL_EXISTS: A user with this email already exists');
    }
    this.users.set(user.id, user);
    this.usersByEmail.set(lowerEmail, user.id);
    return user;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const id = this.usersByEmail.get(email.toLowerCase());
    return id ? this.users.get(id) || null : null;
  }

  // --- Sessions ---
  async createSession(session: Session): Promise<Session> {
    this.sessions.set(session.tokenHash, session);
    return session;
  }

  async findSession(tokenHash: string): Promise<Session | null> {
    const session = this.sessions.get(tokenHash);
    if (!session) return null;

    if (new Date() > new Date(session.expiresAt)) {
      this.sessions.delete(tokenHash);
      return null;
    }

    return session;
  }

  async deleteSession(tokenHash: string): Promise<boolean> {
    return this.sessions.delete(tokenHash);
  }

  // --- Jobs ---
  async createJob(job: Job): Promise<Job> {
    this.jobs.set(job.id, job);
    if (job.dedupeKey) {
      this.jobsByDedupe.set(job.dedupeKey, job.id);
    }
    return job;
  }

  async findJobById(id: string): Promise<Job | null> {
    return this.jobs.get(id) || null;
  }

  async findJobByDedupe(dedupeKey: string): Promise<Job | null> {
    const id = this.jobsByDedupe.get(dedupeKey);
    return id ? this.jobs.get(id) || null : null;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | null> {
    const existing = this.jobs.get(id);
    if (!existing) return null;

    const updated: Job = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  // --- Kits ---
  async createKit(record: KitRecord): Promise<KitRecord> {
    this.kits.set(record.id, record);
    if (record.dedupeKey) {
      this.kitsByDedupe.set(record.dedupeKey, record.id);
    }
    return record;
  }

  async findKitById(id: string): Promise<KitRecord | null> {
    return this.kits.get(id) || null;
  }

  async findKitByDedupe(dedupeKey: string): Promise<KitRecord | null> {
    const id = this.kitsByDedupe.get(dedupeKey);
    return id ? this.kits.get(id) || null : null;
  }

  async listKitsByUser(userId: string): Promise<KitRecord[]> {
    const results: KitRecord[] = [];
    for (const record of this.kits.values()) {
      if (record.userId === userId) {
        results.push(record);
      }
    }
    // Sort descending by updatedAt
    results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return results;
  }

  async updateKit(id: string, updates: Partial<KitRecord>): Promise<KitRecord | null> {
    const existing = this.kits.get(id);
    if (!existing) return null;

    const updated: KitRecord = {
      ...existing,
      ...updates,
      version: updates.version ?? existing.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.kits.set(id, updated);
    return updated;
  }

  // --- Practice ---
  async getPracticeRecord(userId: string, questionId: string): Promise<PracticeRecord | null> {
    const key = `${userId}:${questionId}`;
    return this.practice.get(key) || null;
  }

  async savePracticeRecord(record: PracticeRecord): Promise<PracticeRecord> {
    const key = `${record.userId}:${record.questionId}`;
    this.practice.set(key, record);
    return record;
  }

  async listPracticeByUser(userId: string, kitId?: string): Promise<PracticeRecord[]> {
    const results: PracticeRecord[] = [];
    for (const record of this.practice.values()) {
      if (record.userId === userId) {
        if (!kitId || record.kitId === kitId) {
          results.push(record);
        }
      }
    }
    return results;
  }

  clear(): void {
    this.users.clear();
    this.usersByEmail.clear();
    this.sessions.clear();
    this.jobs.clear();
    this.jobsByDedupe.clear();
    this.kits.clear();
    this.kitsByDedupe.clear();
    this.practice.clear();
  }
}

export const db = new InMemoryDb();
