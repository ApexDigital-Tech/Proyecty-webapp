import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

// Import 'and' from drizzle-orm if not present
if (!content.includes('and } from \'drizzle-orm\'') && content.includes('import { eq, desc, sql } from \'drizzle-orm\';')) {
  content = content.replace(
    'import { eq, desc, sql } from \'drizzle-orm\';',
    'import { eq, desc, sql, and } from \'drizzle-orm\';'
  );
} else if (!content.includes('and,')) {
    content = content.replace(
        'import { eq, desc, sql } from \'drizzle-orm\';',
        'import { eq, desc, sql, and } from \'drizzle-orm\';'
    );
}

// Global project queries (List and Create)
content = content.replace(
  'const allProjects = await db.select().from(projects).orderBy(desc(projects.createdAt));',
  'const allProjects = await db.select().from(projects).where(eq(projects.tenantId, req.user!.tenantId)).orderBy(desc(projects.createdAt));'
);

content = content.replace(
  'const newProject = await db.insert(projects).values({',
  'const newProject = await db.insert(projects).values({\n      tenantId: req.user!.tenantId,'
);

// Single project queries
content = content.replace(
  /where\(eq\(projects\.id, projectId\)\)/g,
  'where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId)))'
);

// Activity Logs queries
content = content.replace(
  /const allLogs = await db\.select\(\)\.from\(activityLogs\)\.orderBy\(desc\(activityLogs\.createdAt\)\);/g,
  'const allLogs = await db.select().from(activityLogs).where(eq(activityLogs.tenantId, req.user!.tenantId)).orderBy(desc(activityLogs.createdAt));'
);
content = content.replace(
  /const logs = await db\.select\(\)\.from\(activityLogs\)\.orderBy\(desc\(activityLogs\.createdAt\)\)\.limit\(100\);/g,
  'const logs = await db.select().from(activityLogs).where(eq(activityLogs.tenantId, req.user!.tenantId)).orderBy(desc(activityLogs.createdAt)).limit(100);'
);
content = content.replace(
  /await db\.insert\(activityLogs\)\.values\(\{/g,
  'await db.insert(activityLogs).values({\n    tenantId: userName === "SISTEMA" ? "DEFAULT" : (await db.select().from(users).where(eq(users.name, userName)).limit(1))[0]?.tenantId || "DEFAULT",'
);

// We need a better way for logActivity to get tenantId.
// Let's replace the logActivity function directly.
content = content.replace(
  /async function logActivity\(projectId: number \| null, userName: string, actionDescription: string\) \{[\s\S]*?\}\n/m,
  `async function logActivity(projectId: number | null, userName: string, actionDescription: string, tenantId?: string) {
  try {
    let tId = tenantId || 'DEFAULT';
    if (!tenantId && userName !== 'SISTEMA') {
       const u = await db.select().from(users).where(eq(users.name, userName)).limit(1);
       if (u.length > 0) tId = u[0].tenantId;
    }
    await db.insert(activityLogs).values({
      tenantId: tId,
      projectId,
      userName,
      actionDescription,
    });
  } catch (err) {
    console.error('Error logging activity:', err);
  }
}
`
);

// Users queries
content = content.replace(
  /const allUsers = await db\.select\(\)\.from\(users\)\.orderBy\(desc\(users\.createdAt\)\);/g,
  'const allUsers = await db.select().from(users).where(eq(users.tenantId, req.user!.tenantId)).orderBy(desc(users.createdAt));'
);

fs.writeFileSync('server.ts', content, 'utf-8');
console.log('Refactoring complete');
