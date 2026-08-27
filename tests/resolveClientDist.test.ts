import assert from 'node:assert';
import path from 'path';
import { resolveClientDist } from '../src/utils/resolveClientDist.ts';

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

  console.log('✅ resolveClientDist tests passed!');
}

runResolveTests();
