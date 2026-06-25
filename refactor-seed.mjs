import fs from 'fs';

let content = fs.readFileSync('src/db/seed.ts', 'utf-8');

// Insert tenantId into project objects
content = content.replace(
  /code: 'PRJ-2024-089',/g,
  "tenantId: 'ORG-PROYECTY.ORG',\n        code: 'PRJ-2024-089',"
);
content = content.replace(
  /code: 'PRJ-2024-090',/g,
  "tenantId: 'ORG-PROYECTY.ORG',\n        code: 'PRJ-2024-090',"
);
content = content.replace(
  /code: 'PRJ-2024-091',/g,
  "tenantId: 'ORG-PROYECTY.ORG',\n        code: 'PRJ-2024-091',"
);

// Insert tenantId into activityLog objects
content = content.replace(
  /projectId: p1\.id,\n        userName: 'Luis Morales',/g,
  "tenantId: 'ORG-PROYECTY.ORG',\n        projectId: p1.id,\n        userName: 'Luis Morales',"
);
content = content.replace(
  /projectId: p1\.id,\n        userName: 'Rodrigo G\.',/g,
  "tenantId: 'ORG-PROYECTY.ORG',\n        projectId: p1.id,\n        userName: 'Rodrigo G.',"
);
content = content.replace(
  /projectId: p1\.id,\n        userName: 'Karla Martínez \(Finanzas\)',/g,
  "tenantId: 'ORG-PROYECTY.ORG',\n        projectId: p1.id,\n        userName: 'Karla Martínez (Finanzas)',"
);

fs.writeFileSync('src/db/seed.ts', content, 'utf-8');
console.log('Seed updated');
