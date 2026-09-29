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
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!/^jiuxiao_test(?:_[a-z0-9-]+)?$/i.test(databaseName)) {
    throw new Error('The database name must begin with jiuxiao_test to reduce the risk of mutating a development or production database.');
  }
} catch (error) {
  console.error('TEST_DATABASE_URL is invalid: ' + (error instanceof Error ? error.message : 'invalid URL'));
  process.exit(1);
}