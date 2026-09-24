import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let database: Db | null = null;

/**
 * Returns a connected MongoClient singleton.
 * Call `connectMongo()` once at application startup.
 * All subsequent calls return the cached connection.
 */
export async function connectMongo(uri?: string): Promise<Db> {
  if (database) return database;

  const mongoUri = uri ?? process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error(
      'MONGODB_URI environment variable is not set. ' +
        'Add it to apps/api/.env or export it before starting the server.'
    );
  }

  client = new MongoClient(mongoUri, {
    // Keep connections alive during dev; tune maxPoolSize for prod
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 45_000,
  });

  await client.connect();
  database = client.db(); // uses the db name embedded in the URI
  console.log(`[MongoDB] Connected → ${mongoUri}`);
  return database;
}

/** Call this on SIGINT/SIGTERM for a graceful shutdown. */
export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    database = null;
    console.log('[MongoDB] Connection closed.');
  }
}

/** Returns the cached Db — throws if connectMongo() hasn't been called yet. */
export function getDb(): Db {
  if (!database) {
    throw new Error(
      'MongoDB is not connected. Call connectMongo() before using getDb().'
    );
  }
  return database;
}
