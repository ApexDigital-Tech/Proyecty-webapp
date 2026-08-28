import 'dotenv/config';
import { resetDemoTenantData } from '../src/services/demoTenant.service.ts';

async function main() {
  console.log('🔄 Ejecutando reinicio determinista del tenant demo VOSERDEM...');
  const result = await resetDemoTenantData();
  console.log(`✅ ${result.message} (Org ID: ${result.orgId})`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error al reiniciar tenant demo:', err);
  process.exit(1);
});
