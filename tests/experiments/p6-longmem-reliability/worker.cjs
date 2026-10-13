'use strict';
const fs = require('node:fs');
const {ReliableStore} = require('./store.cjs');
const cfg = JSON.parse(Buffer.from(process.argv[2], 'base64').toString('utf8'));
try {
  const s = new ReliableStore(cfg.file, {busyMs: cfg.busyMs ?? 5000, hook: phase => {
    if (phase === cfg.pause) {
      fs.writeSync(1, JSON.stringify({checkpoint: phase}) + '\n');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    }
  }});
  const result = s.save(cfg.record, cfg.attachment ?? null);
  s.close(); fs.writeSync(1, JSON.stringify({result}) + '\n');
} catch (e) { fs.writeSync(1, JSON.stringify({error: e.code, message: e.message}) + '\n'); process.exitCode = 2; }
