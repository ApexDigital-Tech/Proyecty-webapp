import 'dotenv/config';
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
import { errorHandler } from './src/middlewares/errorHandler.ts';
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

// Helper for cross-tenant validation
async function verifyProjectTenant(projectId: number, tenantId: number): Promise<boolean> {
  const result = await db.select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  return result.length > 0;
}

const app = express();
app.set('trust proxy', 1);
await initSentry(); // Initialize Sentry before routes

const PORT = 3000;

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
          "script-src": ["'self'", "'unsafe-inline'"], // unsafe-eval eliminado para cumplimiento SEC-01
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

// Capture raw body for webhook HMAC signature verification.
// Must be registered BEFORE express.json() to access the unparsed body.
app.use(express.json({
  verify: (req: any, _res, buf) => {
    // Only store rawBody for webhook routes to minimize memory overhead
    if (req.url?.startsWith('/api/webhooks')) {
      req.rawBody = buf.toString('utf-8');
    }
  },
}));
app.use('/api/', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);

// Lazy-initialize Gemini AI client to prevent crash on startup if missing key
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

import { supabaseBackend as supabase } from './src/lib/supabase-backend.ts';

// ----------------------------------------------------------------------
// Express App Setup
// ----------------------------------------------------------------------

// Ensure database is seeded on startup (Async IIFE)
(async function init() {
  try {
    // Ensure Buckets exist
    const ensureBucket = async (bucketName: string) => {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.find((b: any) => b.name === bucketName)) {
        await supabase.storage.createBucket(bucketName, { public: true });
      }
    };
    await ensureBucket('vouchers');
    await ensureBucket('documents');

    console.log('🔄 Sincronizando base de datos local...');
    await seedDatabase();
    
    // Activar triggers de inmutabilidad estricta para audit_logs en PostgreSQL (M-15)
    const { applyAuditLogsImmutability } = await import('./scripts/apply-audit-immutability.ts');
    await applyAuditLogsImmutability();
    
    console.log('Database verification, immutability triggers and optional seeding complete.');
  } catch (err) {
    console.error('Error during database seed checks:', err);
  }
})();

// ==========================================
// 1. PROJECTS ENDPOINTS
// ==========================================

app.use('/api', documentsRouter);

app.use('/api', authRouter);
app.use('/api', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api', legacyRouter);
// Healthcheck Endpoint Enriquecido (PERF-01)
app.get('/api/health', async (req, res) => {
  const startTime = Date.now();
  try {
    // Medición objetiva de latencia de BD
    await db.execute(sql`SELECT 1`);
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
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        error: String(error),
      },
    });
  }
});

app.use('/api', uploadsRouter);

app.use('/api/expenses', expensesRouter);
app.use('/api/audit-logs', auditRouter);
app.get('/api/activity-logs', (req, res) => {
  res.json({ success: true, data: [] });
});
app.get('/api/agenda', (req, res) => {
  res.json({ success: true, data: [] });
});

app.use('/api', reportsRouter);

// --- Sprint 2: Billing & Webhooks ---
app.use('/api/webhooks', webhooksRouter);
app.use('/api/billing', billingRouter);
app.use('/api/organizations', organizationsRouter);


// List all projects with simplified aggregated budget and progress

// Create a new project (DIRECTOR or MANAGER required)

// Edit general info of an existing project (DIRECTOR or MANAGER required)

// Dashboard metrics


// Detailed view of a project with all aggregate relations

// Update project status/progress (RBAC: DIRECTOR/MANAGER)

import { seed } from './scripts/seed-demo-project.ts';

app.post('/api/admin/run-seed', async (req, res) => {
  try {
    await seed();
    res.json({ success: true, message: "Proyecto cargado", data: [] });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'Ruta API no encontrada' });
});

app.use(errorHandler);

  async function initializeViteAndListen() {
  if (process.env.NODE_ENV === 'development') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // ESM safe way to get directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const { resolveClientDist } = await import('./src/utils/resolveClientDist.ts');
    const clientDist = resolveClientDist(__dirname);
    
    // Validate that index.html and assets/ belong to the same dist
    if (!fs.existsSync(path.join(clientDist, 'index.html')) || !fs.existsSync(path.join(clientDist, 'assets'))) {
      console.warn(`[WARNING] Expected dist assets not found in ${clientDist}`);
    }

    app.use('/assets', express.static(path.join(clientDist, 'assets')));
    app.use(express.static(clientDist));
    
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      if (req.path.startsWith('/assets')) return next();

      // AUTH-DEMO-02: Block /internal-demo in production unless explicitly enabled
      if (req.path === '/internal-demo' && process.env.ENABLE_INTERNAL_DEMO !== 'true') {
        return res.redirect(302, '/');
      }

      // Exclude asset paths from fallback so they 404 properly instead of returning index.html
      if (req.path.startsWith('/assets/')) {
        return res.status(404).send('Not found');
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`PROYECTY Server running on port ${PORT}`);
  });
}

initializeViteAndListen().catch((err) => {
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
    'manager': 'editor',
    'viewer': 'viewer'
  };
  return map[enumValue] || 'viewer';
};
