import dotenv from 'dotenv';
dotenv.config();

// En NODE_ENV=test: aislar completamente de credenciales remotas
if (process.env.NODE_ENV === 'test') {
  if (process.env.VITE_SUPABASE_URL?.includes('supabase.co')) {
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  }
  if (process.env.SUPABASE_URL?.includes('supabase.co')) {
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  }
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VITE_SUPABASE_ANON_KEY;

  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com')) {
    throw new Error('SECURITY_VIOLATION: Remote database detected in NODE_ENV=test.');
  }
}
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './src/routes/auth.routes.ts';
import usersRoutes from './src/routes/users.routes.ts';
import { apiLimiter } from './src/middlewares/rateLimiter.ts';
import { initSentry } from './src/lib/sentry.ts';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { db } from './src/db/index.ts';
import { seedDatabase } from './src/db/seed.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { logActivity } from './src/db/audit.ts';
import documentsRouter from './src/routes/documents.ts';
import authRouter from './src/routes/auth.routes.ts';
import usersRouter from './src/routes/users.routes.ts';
import uploadsRouter from './src/routes/uploads.routes.ts';
import legacyRouter from './src/routes/legacy.routes.ts';
import projectsRouter from './src/routes/projects.routes.ts';
import tasksRouter from './src/routes/tasks.routes.ts';
import webhooksRouter from './src/routes/webhooks.routes.ts';
import billingRouter from './src/routes/billing.routes.ts';
import organizationsRouter from './src/routes/organizations.routes.ts';
import expensesRouter from './src/routes/expenses.routes.ts';
import auditRouter from './src/routes/audit.routes.ts';
import reportsRouter from './src/routes/reports.routes.ts';
import storageRouter from './src/routes/storage.routes.ts';
import { errorHandler } from './src/middlewares/errorHandler.ts';
import { getStorageAdapter } from './src/lib/storage.ts';
import {
  projects,
  agreements,
  disbursements,
  clauses,
  budgetLines,
  receiptsVouchers,
  documents,
  auditLogs,
  users,
  roles,
  donors,
  budgetVersions,
  tasks,
  projectLogs,
  events,
  expenses,
  projectMembers,
} from './src/db/schema.ts';
import { eq, desc, and, inArray, ilike, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// 0. MARCAS DE ARRANQUE INSTRUMENTADAS (BOOT AUDIT)
// ---------------------------------------------------------------------------
function bootLog(step: string, details?: any) {
  const ts = new Date().toISOString();
  console.log(`[BOOT:${step}] [${ts}]`, details ? JSON.stringify(details) : '');
}

bootLog('00_BOOT_INIT');

// ---------------------------------------------------------------------------
// 1. INICIALIZACIÓN DE SENTRY
// ---------------------------------------------------------------------------
bootLog('01_SENTRY_INIT_START');
await initSentry();
bootLog('01_SENTRY_INIT_END');

// ---------------------------------------------------------------------------
// 2. CREACIÓN DE EXPRESS
// ---------------------------------------------------------------------------
bootLog('02_EXPRESS_CREATE_START');
const app = express();
app.set('trust proxy', 1);
bootLog('02_EXPRESS_CREATE_END');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'test' ? '127.0.0.1' : '0.0.0.0');

// ---------------------------------------------------------------------------
// 3. REGISTRO DE MIDDLEWARE
// ---------------------------------------------------------------------------
bootLog('03_MIDDLEWARE_REGISTER_START');

if (process.env.NODE_ENV !== 'production') {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
} else {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "default-src": ["'self'"],
          "script-src": ["'self'", "'unsafe-inline'"],
          "connect-src": ["'self'", "https://*.supabase.co", "wss://*.supabase.co"],
          "img-src": ["'self'", "data:", "https://api.dicebear.com", "https://*.googleusercontent.com"],
        },
      },
    })
  );
}
app.use(cors());

// Prevent caching for all API responses
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});

// Bloqueo estricto anti path traversal
app.use((req, res, next) => {
  const urlToCheck = req.originalUrl || req.url || '';
  const decoded = decodeURIComponent(urlToCheck);
  if (urlToCheck.includes('..') || decoded.includes('..') || urlToCheck.includes('%2e%2e') || urlToCheck.includes('%2E%2E')) {
    return res.status(400).send('Path traversal no permitido');
  }
  next();
});

// Capture raw body for webhook HMAC signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    if (req.url?.startsWith('/api/webhooks')) {
      req.rawBody = buf.toString('utf-8');
    }
  },
}));

// Rate limiter general
app.use('/api/', apiLimiter);

bootLog('03_MIDDLEWARE_REGISTER_END');

// ---------------------------------------------------------------------------
// 4. REGISTRO DE RUTAS & HEALTHCHECK (Healthcheck listo tempranamente)
// ---------------------------------------------------------------------------
bootLog('04_ROUTES_REGISTER_START');

// Healthcheck Endpoint Enriquecido (PERF-01) - Incondicional y no bloqueante
app.get('/api/health', async (req, res) => {
  const startTime = Date.now();
  try {
    // Medición objetiva de latencia de BD con timeout explícito
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB_TIMEOUT_HEALTH')), 2000))
    ]);

    const dbLatencyMs = Date.now() - startTime;
    const memory = process.memoryUsage();
    
    res.status(200).json({
      status: 'healthy',
      version: '1.5.1',
      timestamp: new Date().toISOString(),
      database: {
        status: 'connected',
        latencyMs: dbLatencyMs,
      },
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: {
          rss: Math.round(memory.rss / 1024 / 1024),
          heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        },
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      version: '1.5.1',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        error: String(error),
      },
    });
  }
});

bootLog('04A_HEALTH_ROUTE_REGISTERED');

// Rutas de autenticación y usuarios
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api', authRouter);
app.use('/api', usersRouter);

// Rutas de documentos y almacenamiento
app.use('/api', documentsRouter);
app.use('/', documentsRouter);
app.use('/api', uploadsRouter);
app.use('/api', storageRouter);

// Rutas de proyectos y tareas
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);

// Rutas de finanzas, gastos y auditoría
app.use('/api', expensesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api', legacyRouter);
app.use('/api/audit-logs', auditRouter);
app.get('/api/activity-logs', (req, res) => {
  res.json({ success: true, data: [] });
});
app.get('/api/agenda', (req, res) => {
  res.json({ success: true, data: [] });
});

app.use('/api', reportsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/billing', billingRouter);
app.use('/api/organizations', organizationsRouter);

// Lazy-initialize Gemini AI client
let aiClient: GoogleGenAI | null = null;
export function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== 'MY_GEMINI_API_KEY' && key.trim() !== '' && !key.includes('YOUR_')) {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }
  return aiClient;
}

import { seed } from './scripts/seed-demo-project.ts';

app.post('/api/admin/run-seed', async (req, res) => {
  try {
    await seed();
    res.json({ success: true, message: "Proyecto cargado", data: [] });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.use(errorHandler);

bootLog('04_ROUTES_REGISTER_END');

// ---------------------------------------------------------------------------
// 5. INICIALIZACIÓN DE VITE / DIST Y SERVER LISTEN
// ---------------------------------------------------------------------------
async function initializeViteAndListen() {
  bootLog('05_VITE_SETUP_START');

  if (process.env.NODE_ENV === 'development') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    bootLog('05_VITE_DEV_MIDDLEWARE_READY');
  } else {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const { resolveClientDist } = await import('./src/utils/resolveClientDist.ts');
    const clientDist = resolveClientDist(__dirname);
    
    if (!fs.existsSync(path.join(clientDist, 'index.html')) || !fs.existsSync(path.join(clientDist, 'assets'))) {
      console.warn(`[WARNING] Expected dist assets not found in ${clientDist}`);
    }

    app.use('/assets', express.static(path.join(clientDist, 'assets')));
    app.use(express.static(clientDist));
    
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      if (req.path.startsWith('/assets')) return next();
      if (req.path.startsWith('/fixtures')) return next();

      if (req.path === '/internal-demo' && process.env.ENABLE_INTERNAL_DEMO !== 'true' && process.env.NODE_ENV === 'production') {
        return res.redirect(302, '/');
      }

      if (req.path.startsWith('/assets/') || req.path.startsWith('/fixtures/')) {
        return res.status(404).send('Not found');
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
    bootLog('05_STATIC_DIST_READY');
  }

  bootLog('06_SERVER_LISTEN_START', { host: HOST, port: PORT });

  const server = app.listen(PORT, HOST, async () => {
    bootLog('06_SERVER_LISTEN_END', { host: HOST, port: PORT });
    console.log(`PROYECTY Server running on ${HOST}:${PORT}`);

    // -----------------------------------------------------------------------
    // 6. INICIALIZACIONES OPCIONALES ASÍNCRONAS EN SEGUNDO PLANO (NON-BLOCKING)
    // El servidor ya responde /api/health antes de ejecutar estas tareas.
    // Todas las tareas cuentan con timeout explícito y AbortController.
    // -----------------------------------------------------------------------
    executeBackgroundInitializations().catch((err) => {
      console.error('[BOOT_OPTIONAL] Error en inicializaciones de fondo:', err);
    });
  });

  return server;
}

// Ejecutor seguro con timeout y AbortController para tareas de fondo
async function runWithTimeout<T>(
  taskName: string,
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 5000
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  bootLog(`${taskName}_START`, { timeoutMs });
  try {
    const result = await fn(controller.signal);
    bootLog(`${taskName}_SUCCESS`);
    return result;
  } catch (err: any) {
    bootLog(`${taskName}_FAILED`, { error: err.message });
    console.error(`[BOOT_OPTIONAL] ${taskName} falló o expiró (no bloqueante):`, err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function executeBackgroundInitializations() {
  bootLog('07_BACKGROUND_INIT_START');

  // A. Storage Buckets (Local o Remoto)
  const storage = getStorageAdapter();
  await runWithTimeout('07A_ENSURE_BUCKET_VOUCHERS', async () => {
    await storage.ensureBucket('vouchers', 3000);
  }, 3000);

  await runWithTimeout('07B_ENSURE_BUCKET_DOCUMENTS', async () => {
    await storage.ensureBucket('documents', 3000);
  }, 3000);

  // B. Sincronización / Seed de Base de Datos
  console.log('🔄 Sincronizando base de datos local...');
  await runWithTimeout('08_SEED_DATABASE', async () => {
    await seedDatabase();
  }, 5000);

  // C. Triggers de inmutabilidad en PostgreSQL
  await runWithTimeout('09_APPLY_IMMUTABILITY_TRIGGERS', async () => {
    const { applyAuditLogsImmutability } = await import('./scripts/apply-audit-immutability.ts');
    await applyAuditLogsImmutability();
  }, 5000);

  // D. Regularización atómica e idempotente del comprobante Ecotraffic #6
  await runWithTimeout('09B_REGULARIZE_ECOTRAFFIC_VOUCHER', async () => {
    const { regularizeEcotrafficVoucherTx } = await import('./src/db/migrations/ecotraffic-regularization.ts');
    await regularizeEcotrafficVoucherTx();
  }, 5000);

  bootLog('10_BOOT_COMPLETE');
  console.log('Database verification, immutability triggers and optional seeding complete.');
}

initializeViteAndListen().catch((err) => {
  bootLog('SERVER_START_FATAL_ERROR', { error: err.message });
  console.error('Error starting server:', err);
});

export const mapRoleNameToEnum = (roleName: string) => {
  const map: Record<string, string> = {
    'admin': 'administrator',
    'editor': 'manager',
    'viewer': 'viewer'
  };
  return map[roleName] || 'viewer';
};

export const mapEnumToRoleName = (enumValue: string) => {
  const map: Record<string, string> = {
    'administrator': 'admin',
    'editor': 'manager',
    'viewer': 'viewer'
  };
  return map[enumValue] || 'viewer';
};
