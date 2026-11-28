#!/usr/bin/env node

const raw = process.env.TEST_DATABASE_URL;
if (!raw) {
  console.error('TEST_DATABASE_URL is required; integration tests refuse to skip PostgreSQL coverage silently.');
  process.exit(1);
}

try {
  const url = new URL(raw);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Expected a PostgreSQL URL.');
  }
  if (!url.hostname || !url.pathname || url.pathname === '/') {
    throw new Error('Expected a PostgreSQL host and database name.');
  }
  // Governance §5.2 test isolation: integration suites mutate and drop data, so they
  // may only reach a loopback CI/test instance. Production hostnames are named
  // explicitly so the refusal stays obvious even if the loopback rule is relaxed.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'jiuxiaogame.cn' || host.endsWith('.jiuxiaogame.cn') || host === 'supabase.co' || host.endsWith('.supabase.co')
    || host.endsWith('.supabase.com') || host.endsWith('.pooler.supabase.com')) {
    throw new Error('The host is a production service; integration tests refuse to run against it.');
  }
  const loopback = host === 'localhost' || host.endsWith('.localhost') || host === '::1'
    || /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(host);
  if (!loopback) {
    throw new Error('The host must be a local loopback test instance (localhost, 127.0.0.0/8 or ::1).');
  }
  for (const key of ['host', 'hostaddr']) {
    // libpq lets ?host= / ?hostaddr= override the authority; refuse that bypass.
    if (url.searchParams.has(key)) throw new Error(`The ${key} query parameter is not allowed; put the loopback host in the URL authority.`);
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!/^jiuxiao_test(?:_[a-z0-9-]+)?$/i.test(databaseName)) {
    throw new Error('The database name must begin with jiuxiao_test to reduce the risk of mutating a development or production database.');
  }
} catch (error) {
  console.error('TEST_DATABASE_URL is invalid: ' + (error instanceof Error ? error.message : 'invalid URL'));
  process.exit(1);
}