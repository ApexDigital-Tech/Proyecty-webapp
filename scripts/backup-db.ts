import 'dotenv/config';
import { db } from '../src/db/index.ts';
import fs from 'fs';
import path from 'path';

import {
  organizations,
  roles,
  permissions,
  users,
  donors,
  projects,
  projectMembers,
  agreements,
  disbursements,
  clauses,
  budgetVersions,
  budgetLines,
  expenses,
  receiptsVouchers,
  documents,
  reports,
  indicators,
  auditLogs,
  notifications,
  tasks,
  taskDependencies,
  taskComments,
  projectLogs,
  events,
  eventAttendees,
  documentAnalysis
} from '../src/db/schema.ts';

async function backup() {
  console.log('Iniciando respaldo de base de datos local...');
  const backupData: any = {};

  try {
    backupData.organizations = await db.select().from(organizations);
    backupData.roles = await db.select().from(roles);
    backupData.permissions = await db.select().from(permissions);
    backupData.users = await db.select().from(users);
    backupData.donors = await db.select().from(donors);
    backupData.projects = await db.select().from(projects);
    backupData.projectMembers = await db.select().from(projectMembers);
    backupData.agreements = await db.select().from(agreements);
    backupData.disbursements = await db.select().from(disbursements);
    backupData.clauses = await db.select().from(clauses);
    backupData.budgetVersions = await db.select().from(budgetVersions);
    backupData.budgetLines = await db.select().from(budgetLines);
    backupData.expenses = await db.select().from(expenses);
    backupData.receiptsVouchers = await db.select().from(receiptsVouchers);
    backupData.documents = await db.select().from(documents);
    backupData.reports = await db.select().from(reports);
    backupData.indicators = await db.select().from(indicators);
    backupData.auditLogs = await db.select().from(auditLogs);
    backupData.notifications = await db.select().from(notifications);
    backupData.tasks = await db.select().from(tasks);
    backupData.taskDependencies = await db.select().from(taskDependencies);
    backupData.taskComments = await db.select().from(taskComments);
    backupData.projectLogs = await db.select().from(projectLogs);
    backupData.events = await db.select().from(events);
    backupData.eventAttendees = await db.select().from(eventAttendees);
    backupData.documentAnalysis = await db.select().from(documentAnalysis);

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `respaldo_proyecty_${dateStr}.json`;
    const filepath = path.join(process.cwd(), filename);
    
    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf-8');
    
    console.log(`\n¡Respaldo completado con éxito!`);
    console.log(`Archivo guardado en: ${filepath}`);
    console.log(`Tablas respaldadas: ${Object.keys(backupData).length}`);
    
  } catch (error) {
    console.error('Error durante el respaldo:', error);
  } finally {
    process.exit(0);
  }
}

backup();
