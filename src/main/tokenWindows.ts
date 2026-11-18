/**
 * Token windows for the Home dashboard, folded from `cost-ledger.jsonl`.
 *
 * The ledger holds CUMULATIVE samples per (agent, session). Usage in a time
 * window is the sum of the INCREASES between consecutive samples that land in
 * it. A drop in a session's running total is a process restart (see
 * costLifetime.ts): the new value is then the increase since the reset.
 *
 * Tokens are counted as input + output + cacheRead + cacheCreation, the same
 * total the floor budget uses.
 *
 * Reading is incremental: each call reads only the bytes appended since the
 * last one, and only events from the last 8 days are kept in memory.
 */

import { openSync, readSync, closeSync, statSync } from 'fs';

export interface TokenWindows {
  today: number;
  last5h: number;
  last7d: number;
  /** Tokens in the most recent 60 seconds, across the floor. */
  perMinute: number;
  /** Per agent: today's total, the last minute, and 14 one-minute buckets
   *  (oldest first, the last bucket is the current minute). */
  agents: Array<{ agentId: string; today: number; perMinute: number; buckets: number[] }>;
  /** False until the ledger has been read once. */
  warm: boolean;
}

interface Ev { ts: number; agentId: string; delta: number }

const KEEP_MS = 8 * 24 * 60 * 60 * 1000;
const MAX_BYTES_PER_PASS = 16 * 1024 * 1024;
export const BUCKETS = 14;

export class TokenWindowFold {
  private path: string | null = null;
  private offset = 0;
  private tail = '';
  private last = new Map<string, number>();
  private events: Ev[] = [];
  private warm = false;

  /** Pure fold step, exported for tests. */
  ingestLine(line: string): void {
    if (!line.trim()) return;
    let r: Record<string, unknown>;
    try { r = JSON.parse(line); } catch { return; }
    const agentId = typeof r.agent_id === 'string' ? r.agent_id : null;
    const ts = typeof r.ts === 'number' ? r.ts : NaN;
    if (!agentId || !Number.isFinite(ts)) return;
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const total = n(r.input) + n(r.output) + n(r.cache_read) + n(r.cache_creation);
    const key = `${agentId}\t${typeof r.session_id === 'string' ? r.session_id : ''}`;
    const prev = this.last.get(key);
    this.last.set(key, total);
    const delta = prev === undefined ? 0 : total >= prev ? total - prev : total;
    if (delta > 0) this.events.push({ ts, agentId, delta });
  }

  private read(path: string): void {
    if (path !== this.path) {
      this.path = path; this.offset = 0; this.tail = '';
      this.last.clear(); this.events = []; this.warm = false;
    }
    let size: number;
    try { size = statSync(path).size; } catch { this.warm = true; return; }
    if (size < this.offset) { this.offset = 0; this.tail = ''; this.last.clear(); this.events = []; }
    if (size === this.offset) { this.warm = true; return; }
    const len = Math.min(size - this.offset, MAX_BYTES_PER_PASS);
    const buf = Buffer.alloc(len);
    let fd: number | null = null;
    try {
      fd = openSync(path, 'r');
      readSync(fd, buf, 0, len, this.offset);
    } catch { return; } finally { if (fd !== null) try { closeSync(fd); } catch { /* noop */ } }
    this.offset += len;
    const text = this.tail + buf.toString('utf8');
    const lines = text.split('\n');
    this.tail = lines.pop() ?? '';
    for (const l of lines) this.ingestLine(l);
    if (this.offset >= size) this.warm = true;
  }

  compute(ledgerPath: string | null, now = Date.now()): TokenWindows {
    if (ledgerPath) this.read(ledgerPath);
    else this.warm = true;
    const cutoff = now - KEEP_MS;
    if (this.events.length && this.events[0].ts < cutoff) {
      this.events = this.events.filter((e) => e.ts >= cutoff);
    }
    return this.summarize(now);
  }

  /** Window sums over the events held in memory. Exported for tests. */
  summarize(now: number): TokenWindows {
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const startToday = midnight.getTime();
    const start5h = now - 5 * 60 * 60 * 1000;
    const start7d = now - 7 * 24 * 60 * 60 * 1000;
    const startMin = now - 60 * 1000;
    const curMinute = Math.floor(now / 60000);
    const out: TokenWindows = { today: 0, last5h: 0, last7d: 0, perMinute: 0, agents: [], warm: this.warm };
    const per = new Map<string, { today: number; perMinute: number; buckets: number[] }>();
    for (const e of this.events) {
      if (e.ts > now) continue;
      if (e.ts >= start7d) out.last7d += e.delta;
      if (e.ts >= start5h) out.last5h += e.delta;
      if (e.ts >= startMin) out.perMinute += e.delta;
      if (e.ts < startToday) continue;
      out.today += e.delta;
      let a = per.get(e.agentId);
      if (!a) { a = { today: 0, perMinute: 0, buckets: new Array(BUCKETS).fill(0) }; per.set(e.agentId, a); }
      a.today += e.delta;
      if (e.ts >= startMin) a.perMinute += e.delta;
      const ago = curMinute - Math.floor(e.ts / 60000);
      if (ago >= 0 && ago < BUCKETS) a.buckets[BUCKETS - 1 - ago] += e.delta;
    }
    out.agents = [...per.entries()]
      .map(([agentId, v]) => ({ agentId, ...v }))
      .sort((x, y) => y.perMinute - x.perMinute || y.today - x.today);
    return out;
  }
}
