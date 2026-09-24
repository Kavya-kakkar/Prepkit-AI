import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load .env from the api package directory, regardless of where tsx is run from
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });
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

export function createServer(): express.Express {
  const app = express();

  // Basic CORS middleware
  app.use((req, res, next) => {
    const origin = req.headers.origin || 'http://localhost:3000';
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

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', coreVersion: CORE_VERSION });
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

// ── Startup (only when run directly, not imported by tests) ────────────────
const PORT = parseInt(process.env.PORT || '4000', 10);
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  (async () => {
    // 1. Connect to MongoDB and create indexes
    const mongoDbInstance = await connectMongo();
    const mongoRepo = new MongoDb(mongoDbInstance);
    await mongoRepo.ensureIndexes();

    // 2. Register the live instance so all routes/services pick it up via the proxy
    setDb(mongoRepo);

    // 3. Start the HTTP server
    const app = createServer();
    const server = app.listen(PORT, () => {
      console.log(`AI Interview Prep API server listening on http://localhost:${PORT}`);
    });

    // 4. Graceful shutdown
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
