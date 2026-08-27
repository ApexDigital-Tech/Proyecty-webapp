import path from 'path';

export function resolveClientDist(moduleDir: string): string {
  const normalizedModuleDir = path.normalize(moduleDir);
  const distSuffix = path.normalize('/dist');
  
  if (normalizedModuleDir.endsWith(distSuffix)) {
    return normalizedModuleDir;
  }
  return path.join(normalizedModuleDir, 'dist');
}
