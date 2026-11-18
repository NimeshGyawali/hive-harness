'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { TokenWindowFold, BUCKETS } = loadTs('src/main/tokenWindows.ts');

const row = (agent, session, ts, input, output = 0, cacheRead = 0, cacheCreation = 0) =>
  JSON.stringify({ agent_id: agent, session_id: session, ts, input, output, cache_read: cacheRead, cache_creation: cacheCreation, model: 'm', usd: 0 });

test('sums increases between cumulative samples, never the first absolute value', () => {
  const now = new Date(2026, 10, 18, 18, 0, 45).getTime();
  const f = new TokenWindowFold();
  f.ingestLine(row('a', 's', now - 10 * 60000, 1000));
  f.ingestLine(row('a', 's', now - 5 * 60000, 1500, 100));
  f.ingestLine(row('a', 's', now - 30000, 2000, 100, 400));
  const w = f.summarize(now);
  assert.equal(w.today, 1500);
  assert.equal(w.last5h, 1500);
  assert.equal(w.perMinute, 900);
  assert.equal(w.agents[0].agentId, 'a');
  assert.equal(w.agents[0].buckets.length, BUCKETS);
  assert.equal(w.agents[0].buckets[BUCKETS - 1], 900);
  assert.equal(w.agents[0].buckets[BUCKETS - 6], 600);
});

test('a drop in a running total is a restart: the new value counts in full', () => {
  const now = Date.now();
  const f = new TokenWindowFold();
  f.ingestLine(row('a', 's', now - 3000, 5000));
  f.ingestLine(row('a', 's', now - 2000, 6000));
  f.ingestLine(row('a', 's', now - 1000, 300));
  assert.equal(f.summarize(now).last5h, 1300);
});

test('sessions and agents are tracked separately; older usage only reaches 7 days', () => {
  const now = new Date(2026, 10, 18, 12, 0, 0).getTime();
  const day = 24 * 60 * 60 * 1000;
  const f = new TokenWindowFold();
  f.ingestLine(row('a', 's1', now - 3 * day, 0));
  f.ingestLine(row('a', 's1', now - 3 * day + 1000, 700));
  f.ingestLine(row('b', 's2', now - 2000, 0));
  f.ingestLine(row('b', 's2', now - 1000, 50));
  const w = f.summarize(now);
  assert.equal(w.last7d, 750);
  assert.equal(w.today, 50);
  assert.deepEqual(w.agents.map((x) => x.agentId), ['b']);
});

test('reads a ledger file incrementally and ignores a torn last line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-'));
  const p = path.join(dir, 'cost-ledger.jsonl');
  const now = Date.now();
  fs.writeFileSync(p, row('a', 's', now - 2000, 100) + '\n' + row('a', 's', now - 1000, 400) + '\n{"agent_id":');
  const f = new TokenWindowFold();
  assert.equal(f.compute(p, now).last5h, 300);
  fs.appendFileSync(p, '"a","session_id":"s","ts":' + (now - 500) + ',"input":450}\n');
  assert.equal(f.compute(p, now).last5h, 350);
  assert.equal(new TokenWindowFold().compute(path.join(dir, 'missing.jsonl'), now).warm, true);
});
