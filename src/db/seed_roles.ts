import { db } from './index.ts';
import { roles, permissions } from './schema.ts';
import { eq } from 'drizzle-orm';

const ALL_MODULES = [
  'projects', 'budgets', 'budget_lines', 'expenses', 'disbursements', 
  'vouchers', 'users', 'reports', 'donors', 'agreements'
];

const ROLES_TO_SEED = [
  {
    name: 'DIRECTOR',
    description: 'SuperAdmin del Tenant',
    permissions: ALL_MODULES.flatMap(m => [
      { module: m, action: 'create' },
      { module: m, action: 'read' },
      { module: m, action: 'update' },
      { module: m, action: 'delete' },
      { module: m, action: 'approve' },
      { module: m, action: 'manage' }
    ])
  },
  {
    name: 'MANAGER',
    description: 'Gestor Operativo',
    permissions: [
      ...ALL_MODULES.map(m => ({ module: m, action: 'read' })),
      { module: 'projects', action: 'create' }, { module: 'projects', action: 'update' },
      { module: 'budgets', action: 'create' }, { module: 'budgets', action: 'update' },
      { module: 'expenses', action: 'create' }, { module: 'expenses', action: 'update' }, { module: 'expenses', action: 'approve' },
      { module: 'agreements', action: 'create' }, { module: 'agreements', action: 'update' }
    ]
  },
  {
    name: 'FINANCE',
    description: 'Finanzas / Contabilidad',
    permissions: [
      ...ALL_MODULES.map(m => ({ module: m, action: 'read' })),
      { module: 'expenses', action: 'create' }, { module: 'expenses', action: 'update' }, { module: 'expenses', action: 'approve' },
      { module: 'disbursements', action: 'create' }, { module: 'disbursements', action: 'update' }, { module: 'disbursements', action: 'approve' },
      { module: 'vouchers', action: 'create' }, { module: 'vouchers', action: 'update' }, { module: 'vouchers', action: 'approve' },
      { module: 'budgets', action: 'create' }, { module: 'budgets', action: 'update' }, { module: 'budgets', action: 'approve' }
    ]
  },
  {
    name: 'RESPONSABLE_PROYECTO',
    description: 'Responsable de Proyecto',
    permissions: [
      { module: 'projects', action: 'read' }, { module: 'projects', action: 'create' }, { module: 'projects', action: 'update' },
      { module: 'expenses', action: 'read' }, { module: 'expenses', action: 'create' }
    ]
  },
  {
    name: 'FINANCIADOR',
    description: 'Donante / Financiador',
    permissions: [
      { module: 'projects', action: 'read' },
      { module: 'reports', action: 'read' },
      { module: 'budgets', action: 'read' }
    ]
  },
  {
    name: 'AUDITOR',
    description: 'Auditor Externo',
    permissions: ALL_MODULES.map(m => ({ module: m, action: 'read' }))
  }
];

export async function seedRoles() {
  console.log('Iniciando seed de roles y permisos...');
  
  // Envolvemos todo en una única transacción atómica (Punto 2 requerido por el usuario)
  await db.transaction(async (tx) => {
    for (const roleDef of ROLES_TO_SEED) {
      // 1. UPSERT Rol
      let roleRecord = await tx.select().from(roles).where(eq(roles.name, roleDef.name)).limit(1);
      
      let roleId: number;
      if (roleRecord.length > 0) {
        roleId = roleRecord[0].id;
        await tx.update(roles).set({ description: roleDef.description, isSystemRole: true }).where(eq(roles.id, roleId));
      } else {
        const newRole = await tx.insert(roles).values({
          name: roleDef.name,
          description: roleDef.description,
          isSystemRole: true
        }).returning({ id: roles.id });
        roleId = newRole[0].id;
      }
      
      // 2. DELETE permisos existentes para evitar duplicados / actualizar matriz
      await tx.delete(permissions).where(eq(permissions.roleId, roleId));
      
      // 3. INSERT nuevos permisos
      if (roleDef.permissions.length > 0) {
        await tx.insert(permissions).values(
          roleDef.permissions.map(p => ({
            roleId,
            module: p.module,
            action: p.action
          }))
        );
      }
      
      console.log(`✅ Rol ${roleDef.name} y sus permisos han sido sembrados.`);
    }
  });

  console.log('🎉 Seed de roles completado en una transacción atómica.');
}

// Ejecutar si se llama directamente
if (process.argv[1]?.includes('seed_roles')) {
  seedRoles().catch(console.error).finally(() => process.exit(0));
}
