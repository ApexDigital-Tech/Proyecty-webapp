// @ts-nocheck
import 'dotenv/config'; 
import { db } from './src/db/index.ts'; 
import { projects } from './src/db/schema.ts'; 
import { eq } from 'drizzle-orm'; 

async function fix() { 
  await db.update(projects).set({ name: 'Programa Integral de Agroforestería, Gestión del Agua y Resiliencia Climática' }).where(eq(projects.id, 1)); 
  console.log('Fixed'); 
  process.exit(0); 
} 
fix();
