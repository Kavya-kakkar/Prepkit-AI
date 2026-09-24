import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Only attempt local .env file load if running outside production serverless environments
if (process.env.NODE_ENV !== 'production') {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    config({ path: resolve(__dirname, '../.env') });
  } catch {
    // Ignore error in serverless runtimes where .env file is absent
  }
}

import express from 'express';
import { CORE_VERSION } from '@ai-prep/core';
import { authRouter } from './routes/auth.js';
import { kitsRouter } from './routes/kits.js';
import { jobsRouter } from './routes/jobs.js';
import { practiceRouter } from './routes/practice.js';
import { errorHandler } from './middleware/errorHandler.js';
import { connectMongo, closeMongo } from './repositories/mongoConnection.js';
import { MongoDb } from './repositories/mongoDb.js';
import { setDb } from './repositories/db.js';

// Lazy MongoDB connection wrapper for Vercel Serverless environment
let isMongoConnected = false;
async function ensureDbConnected() {
  if (!isMongoConnected) {
    try {
      const mongoDbInstance = await connectMongo();
      const mongoRepo = new MongoDb(mongoDbInstance);
      await mongoRepo.ensureIndexes();
      setDb(mongoRepo);
      isMongoConnected = true;
    } catch (err) {
      console.error('[MongoDB Error] Lazy connection failed:', err);
    }
  }
}

export function createServer(): express.Express {
  const app = express();

  // Basic CORS middleware
  app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  // Middleware to ensure DB connection before handling API routes in serverless mode
  app.use(async (_req, _res, next) => {
    await ensureDbConnected();
    next();
  });

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', coreVersion: CORE_VERSION, dbConnected: isMongoConnected });
  });

  // API Route Mounts
  app.use('/api/auth', authRouter);
  app.use('/api/kits', kitsRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/practice', practiceRouter);

  // Central error handling
  app.use(errorHandler);

  return app;
}

const app = createServer();

// ── Startup (only when run directly in local/traditional Node process) ─────
const PORT = parseInt(process.env.PORT || '4000', 10);
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  (async () => {
    await ensureDbConnected();

    const server = app.listen(PORT, () => {
      console.log(`AI Interview Prep API server listening on http://localhost:${PORT}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`\n[${signal}] Shutting down gracefully…`);
      server.close(async () => {
        await closeMongo();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })().catch((err) => {
    console.error('[Startup] Fatal error:', err);
    process.exit(1);
  });
}

// Export default app for Vercel Serverless Function Handler
export default app;