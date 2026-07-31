import 'dotenv/config';
import { db } from '../src/db/index.js';
import { users, roles } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function updateRole() {
  console.log('Buscando rol "Director" o "DIRECTOR"...');
  
  // Try to find Director role (it might be case sensitive)
  const allRoles = await db.select().from(roles);
  console.log('Roles disponibles:', allRoles.map(r => r.name));
  
  const directorRole = allRoles.find(r => r.name.toUpperCase() === 'DIRECTOR');
  
  if (!directorRole) {
    console.error('❌ Rol de Director no encontrado en la base de datos.');
    process.exit(1);
  }

  const email = 'apexdigital70@gmail.com';
  console.log(`Actualizando rol de ${email} a ID: ${directorRole.id} (${directorRole.name})`);

  const result = await db.update(users)
    .set({ roleId: directorRole.id })
    .where(eq(users.email, email))
    .returning();

  if (result.length > 0) {
    console.log('✅ Usuario actualizado correctamente:', result[0].email, 'Nuevo Rol ID:', result[0].roleId);
  } else {
    console.log('⚠️ No se encontró al usuario con ese correo electrónico.');
  }

  process.exit(0);
}

updateRole().catch(e => {
  console.error(e);
  process.exit(1);
});
