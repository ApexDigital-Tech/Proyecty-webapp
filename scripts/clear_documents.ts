import { db } from '../src/db/index.ts';
import { documents } from '../src/db/schema.ts';

async function main() {
  await db.delete(documents);
  console.log('Documents cleared.');
}

main().catch(console.error);
