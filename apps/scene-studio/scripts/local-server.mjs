import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

async function reservePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local port');
  await new Promise((ok, fail) => probe.close(error => error ? fail(error) : ok()));
  return address.port;
}

export async function startStudioServer(root) {
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}`;
  const studioDir = resolve(root, 'apps/scene-studio');
  const server = spawn(process.execPath, [
    resolve(studioDir, 'node_modules/vite/bin/vite.js'),
    '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { cwd: studioDir, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let startError;
  server.stderr.setEncoding('utf8');
  server.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4000); });
  server.on('error', error => { startError = error; });

  const stop = async () => {
    if (!server.pid || server.exitCode !== null || server.signalCode !== null) return;
    server.kill();
    const exited = await Promise.race([
      once(server, 'exit').then(() => true),
      sleep(2500).then(() => false),
    ]);
    if (!exited && server.exitCode === null && server.signalCode === null) {
      server.kill('SIGKILL');
      await Promise.race([once(server, 'exit'), sleep(1500)]);
    }
  };

  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startError) throw startError;
      if (server.exitCode !== null || server.signalCode !== null) {
        throw new Error(`Vite exited before becoming ready${stderr ? `: ${stderr}` : ''}`);
      }
      try {
        const response = await fetch(`${url}/`);
        if (response.ok) {
          const html = await response.text();
          if (html.includes('九霄 · 山门场景工作台') && html.includes('src="/src/main.tsx"')) return { url, stop };
        }
      } catch { /* Vite is starting. */ }
      await sleep(200);
    }
    throw new Error(`Studio did not serve its expected page${stderr ? `: ${stderr}` : ''}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
