import assert from 'node:assert';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveClientDist } from '../src/utils/resolveClientDist.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runResolveTests() {
  console.log('Running resolveClientDist tests...');

  // 1. ruta fuente Windows
  {
    const input = 'C:\\Proyectos\\Proyecty-webapp';
    const expected = path.join(input, 'dist');
    assert.strictEqual(resolveClientDist(input), expected);
  }

  // 2. ruta compilada Windows
  {
    const input = 'C:\\Proyectos\\Proyecty-webapp\\dist';
    assert.strictEqual(resolveClientDist(input), path.normalize(input));
  }

  // 3. ruta fuente Linux
  {
    const input = '/home/user/proyecty-webapp';
    const expected = path.join(input, 'dist');
    assert.strictEqual(resolveClientDist(input), expected);
  }

  // 4. ruta compilada Linux
  {
    const input = '/home/user/proyecty-webapp/dist';
    assert.strictEqual(resolveClientDist(input), path.normalize(input));
  }

  // 5. directorio cuyo nombre contiene "dist" pero no es exactamente dist
  {
    const input = '/home/user/proyecty-dist-webapp';
    const expected = path.join(input, 'dist');
    assert.strictEqual(resolveClientDist(input), expected);
  }

  // 6. ausencia de doble dist/dist
  {
    const input = '/home/user/app/dist';
    assert.strictEqual(resolveClientDist(input), path.normalize(input));
    assert.notStrictEqual(resolveClientDist(input), path.join(input, 'dist'));
  }

  // 7. Verificación de extracción dinámica de assets de dist/index.html
  {
    const indexPath = path.join(__dirname, '../dist/index.html');
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf-8');
      const match = html.match(/src="(\/assets\/[^"]+)"/);
      assert.ok(match, 'dist/index.html debe contener un script de asset estático real');
      const realAssetPath = match[1];
      assert.ok(realAssetPath.startsWith('/assets/'), 'Ruta de asset real debe iniciar con /assets/');
      assert.ok(realAssetPath.endsWith('.js'), 'Asset principal debe ser archivo .js');
    }
  }

  console.log('✅ resolveClientDist tests passed!');
}

runResolveTests();
