import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.PAGES_SIM_FIXTURE_PORT ?? 18789);
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'private, max-age=60');

  if (url.pathname === '/health') {
    response.writeHead(200);
    response.end(JSON.stringify({ status: 'ok', fixture: true }));
    return;
  }
  if (url.pathname === '/ready') {
    response.writeHead(200);
    response.end(JSON.stringify({ status: 'ready', fixture: true }));
    return;
  }
  if (url.pathname === '/api/auth/session') {
    response.writeHead(404);
    response.end(JSON.stringify({ code: 'NOT_FOUND' }));
    return;
  }
  if (url.pathname === '/api/auth/providers') {
    response.writeHead(200);
    response.end(JSON.stringify({ email: false, phone: false }));
    return;
  }
  if (url.pathname === '/api/diagnostics/export') {
    response.setHeader('content-type', 'application/octet-stream');
    response.setHeader('content-disposition', 'attachment; filename="synthetic-export.json"');
    response.setHeader('location', 'https://api.jiuxiaogame.cn/api/diagnostics/export');
    response.setHeader('set-cookie', [
      'jx_session=synthetic-a; Path=/; HttpOnly; Secure; SameSite=Strict',
      'jx_csrf=synthetic-b; Path=/; Secure; SameSite=Strict',
    ]);
    response.writeHead(200);
    response.end('synthetic payload');
    return;
  }
  if (url.pathname === '/api/echo') {
    response.writeHead(200);
    response.end(JSON.stringify({
      method: request.method,
      path: `${url.pathname}${url.search}`,
      origin: request.headers.origin ?? null,
      cookie: request.headers.cookie ?? null,
      body,
    }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ code: 'NOT_FOUND' }));
});

server.listen(port, host, () => process.stdout.write(`synthetic Pages API upstream ready at http://${host}:${port}\n`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
