import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// CI-only read-only smoke against a newly built image and ephemeral test DB.
const image = process.env.TEST_API_IMAGE;
if (!image || !/^jiuxiao-api-review:[0-9a-f]{40}$/.test(image)) throw new Error('TEST_API_IMAGE must identify the exact reviewed commit');
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/jiuxiao_test') throw new Error('Only the ephemeral CI database is allowed');
let container;
try {
  container = execFileSync('docker', ['run', '--detach', '--network', 'host', '-e', `DATABASE_URL=${databaseUrl}`,
    '-e', 'API_PORT=18789', '-e', 'API_HOST=127.0.0.1', '-e', 'AUTH_ENABLED=false', image], { encoding: 'utf8' }).trim();
  assert.match(container, /^[0-9a-f]{64}$/);
  assert.equal(execFileSync('docker', ['exec', container, 'id', '-u'], { encoding: 'utf8' }).trim(), '1000');
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const health = await fetch('http://127.0.0.1:18789/health', { signal: AbortSignal.timeout(1000) });
      const dependency = await fetch('http://127.0.0.1:18789/ready', { signal: AbortSignal.timeout(1000) });
      if (health.ok && dependency.ok) { ready = true; break; }
    } catch { /* The newly started process may not yet be listening. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Built API image must start and reach the isolated database');
  const closed = await fetch('http://127.0.0.1:18789/api/auth/session');
  assert.equal(closed.status, 404, 'Authentication remains disabled without explicit deployment configuration');
  const imageId = execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', image], { encoding: 'utf8' }).trim();
  assert.match(imageId, /^sha256:[0-9a-f]{64}$/);
  mkdirSync('test-results/cloud', { recursive: true });
  writeFileSync('test-results/cloud/api-image.json', JSON.stringify({ commit: image.split(':')[1], imageId,
    isolatedEnvironment: true, uid: 1000, health: 'passed', databaseReadiness: 'passed', authDefaultClosed: 'passed',
    productionDeploymentAccepted: false }, null, 2) + '\n');
  console.log('API image smoke passed: non-root process, health, database readiness, auth fail-closed.');
} finally {
  if (container && /^[0-9a-f]{64}$/.test(container)) execFileSync('docker', ['stop', '--time', '5', container], { stdio: 'ignore' });
}
