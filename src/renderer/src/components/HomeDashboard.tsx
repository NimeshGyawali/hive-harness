/**
 * Home dashboard (hiveharness): one screen that answers "what is happening on
 * my floor right now?" without reading terminals.
 *
 *   Tokens    today / 5 hours / 7 days, the floor's rate this minute, and a
 *             14-minute strip per agent that is burning tokens now.
 *   Active    agents that are working right now, with what they are doing.
 *   Tasks     cards in "doing" (and "blocked"), with the assignee.
 *   Ask me    the existing ASK ME board, answerable in place.
 *
 * Clicking an agent selects it, so its terminal and composer open in the right
 * sidebar. Clicking a task opens the task detail overlay.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useStore, type Agent } from '@/store/store';
import { SpritePortrait } from './SpritePortrait';
import { AskMeTab } from './AskMeTab';
import { parseTasks, waitsOnHuman, type HiveTask } from './TasksKanban';

const POLL_MS = 5000;
const ACTIVE = new Set(['working', 'thinking', 'typing', 'compacting']);

interface TokenWindows {
  today: number;
  last5h: number;
  last7d: number;
  perMinute: number;
  agents: Array<{ agentId: string; today: number; perMinute: number; buckets: number[] }>;
  warm: boolean;
}

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

function usePoll<T>(fn: () => Promise<T>, initial: T): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try { const r = await fn(); if (alive) setV(r); } catch { /* keep last good */ }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

const card: CSSProperties = {
  background: 'var(--cth-paper-100)',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
  borderRadius: 8,
  display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden'
};

function Card({ title, count, right, children, style }: {
  title: string; count?: number; right?: ReactNode; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <section style={{ ...card, ...style }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        borderBottom: '1px solid var(--cth-ink-100)', flexShrink: 0
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cth-ink-900)' }}>{title}</span>
        {count !== undefined && (
          <span style={{
            fontSize: 11, minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--cth-mint-light)', color: 'var(--cth-ink-900)'
          }}>{count}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--cth-ink-500)' }}>{right}</span>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = ACTIVE.has(status);
  const blocked = status === 'blocked' || status === 'waiting';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
      padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
      background: active ? 'var(--cth-mint-light)' : blocked ? 'var(--cth-peach-light)' : 'var(--cth-cream-100)',
      color: 'var(--cth-ink-900)'
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 3,
        background: active ? 'var(--cth-status-working)' : blocked ? 'var(--cth-status-blocked)' : 'var(--cth-status-idle)'
      }} />
      {status}
    </span>
  );
}

function Strip({ buckets, max }: { buckets: number[]; max: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {buckets.map((b, i) => {
        const level = b <= 0 || max <= 0 ? 0 : Math.max(0.2, b / max);
        return (
          <span key={i} title={`${fmtTokens(b)} tokens`} style={{
            width: 12, height: 12, borderRadius: 2,
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
            background: level === 0 ? 'transparent' : 'var(--cth-lemon)',
            opacity: level === 0 ? 1 : level
          }} />
        );
      })}
    </span>
  );
}

function Avatar({ agent }: { agent?: Agent }) {
  if (!agent) return <span style={{ width: 28 }} />;
  return (
    <span style={{ width: 28, height: 28, flexShrink: 0, overflow: 'hidden', display: 'inline-flex' }}>
      <SpritePortrait character={agent.character} scale={1} />
    </span>
  );
}

export function HomeDashboard() {
  const agents = useStore((s) => s.agents);
  const select = useStore((s) => s.select);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const tokens = usePoll<TokenWindows | null>(() => window.cth.dashboardTokens(), null);
  const tasks = usePoll<HiveTask[]>(async () => parseTasks(await window.cth.hiveTasks()), []);

  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const nameOf = (id?: string): string => (id ? byId.get(id)?.name ?? id : 'unassigned');
  const live = agents.filter((a) => !a.archived);
  const active = live.filter((a) => ACTIVE.has(a.status));
  const notWorking = live.filter((a) => !ACTIVE.has(a.status));
  const inFlight = tasks.filter((t) => t.status === 'doing' || t.status === 'blocked');
  const asks = tasks.filter(waitsOnHuman).length;

  const burning = (tokens?.agents ?? []).filter((a) => a.buckets.some((b) => b > 0));
  const quiet = (tokens?.agents ?? []).filter((a) => !a.buckets.some((b) => b > 0));
  const stripMax = Math.max(1, ...burning.flatMap((a) => a.buckets));

  const row: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
    borderBottom: '1px solid var(--cth-ink-100)', cursor: 'pointer'
  };
  const muted: CSSProperties = { color: 'var(--cth-ink-500)', fontSize: 12 };

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'auto',
      display: 'grid', gap: 12,
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(280px, 0.8fr)',
      gridTemplateRows: 'auto minmax(260px, 1fr)',
      fontFamily: 'var(--cth-font-ui)', color: 'var(--cth-ink-900)'
    }}>
      {/* ── Tokens ── */}
      <Card title="Tokens" right="Fastest first. Each cell is one minute." style={{ gridColumn: '1 / 3' }}>
        <div style={{ display: 'flex', minHeight: 0 }}>
          <div style={{ padding: 14, flex: '0 0 42%', borderRight: '1px solid var(--cth-ink-100)' }}>
            <div style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.1 }}>
              {tokens ? fmtTokens(tokens.today) : '…'}
              <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 8, color: 'var(--cth-ink-700)' }}>tokens today</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span><span style={muted}>5 hours</span> <b>{fmtTokens(tokens?.last5h ?? 0)}</b></span>
              <span><span style={muted}>7 days</span> <b>{fmtTokens(tokens?.last7d ?? 0)}</b></span>
              <span><span style={muted}>Now</span> <b>{fmtTokens(tokens?.perMinute ?? 0)}</b> <span style={muted}>a min</span></span>
            </div>
            {quiet.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
                <span style={muted}>Quiet now: </span>
                {quiet.map((a, i) => (
                  <span key={a.agentId}>{i > 0 && ', '}<b>{nameOf(a.agentId)}</b> {fmtTokens(a.today)}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: 14, flex: 1, minWidth: 0 }}>
            {burning.length === 0 ? (
              <div style={muted}>{tokens?.warm === false ? 'Reading usage…' : 'Nobody is burning tokens right now.'}</div>
            ) : (
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={muted}>
                    <th style={{ textAlign: 'left', fontWeight: 500 }}>Burning now</th>
                    <th style={{ textAlign: 'left', fontWeight: 500 }}>14 min ago → now</th>
                    <th style={{ textAlign: 'right', fontWeight: 500 }}>a min</th>
                    <th style={{ textAlign: 'right', fontWeight: 500 }}>today</th>
                  </tr>
                </thead>
                <tbody>
                  {burning.map((a) => (
                    <tr key={a.agentId} style={{ cursor: 'pointer' }} onClick={() => byId.has(a.agentId) && select(a.agentId)}>
                      <td style={{ padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>{nameOf(a.agentId)}</td>
                      <td style={{ padding: '4px 0' }}><Strip buckets={a.buckets} max={stripMax} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTokens(a.perMinute)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtTokens(a.today)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Card>

      {/* ── Ask me ── */}
      <Card title="Ask me" count={asks} style={{ gridColumn: '3', gridRow: '1 / 3' }}>
        <div style={{ height: '100%', minHeight: 300 }}><AskMeTab /></div>
      </Card>

      {/* ── Active now ── */}
      <Card title="Active now" count={active.length} right={<span><span style={{ color: 'var(--cth-status-working)' }}>●</span> Live</span>}>
        {active.length === 0 && <div style={{ ...muted, padding: 14 }}>No agent is working right now.</div>}
        {active.map((a) => (
          <div key={a.id} style={row} onClick={() => select(a.id)}>
            <Avatar agent={a} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>
                <b>{a.name}</b> <span style={{ color: 'var(--cth-ink-700)' }}>{a.goal || a.action || a.description}</span>
              </div>
              <div style={{ ...muted, fontFamily: 'var(--cth-font-mono)' }}>{a.carrying ?? a.action ?? ''}</div>
            </div>
            <StatusPill status={a.status} />
          </div>
        ))}
        {notWorking.length > 0 && (
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--cth-ink-700)' }}>
            <span style={muted}>Not working: </span>
            {notWorking.map((a, i) => (
              <span key={a.id} style={{ cursor: 'pointer' }} onClick={() => select(a.id)}>
                {i > 0 && ', '}<b>{a.name}</b>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* ── Tasks ── */}
      <Card title="Tasks" count={inFlight.length} right={`${tasks.filter((t) => t.status === 'todo').length} to do · ${tasks.filter((t) => t.status === 'done').length} done`}>
        {inFlight.length === 0 && <div style={{ ...muted, padding: 14 }}>No task is in progress.</div>}
        {inFlight.map((t) => {
          const owner = t.assignee ? byId.get(t.assignee) : undefined;
          return (
            <div key={t.id} style={{ ...row, alignItems: 'flex-start' }} onClick={() => openTaskDetail(t.id)}>
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 10, marginTop: 2, flexShrink: 0,
                background: t.status === 'blocked' ? 'var(--cth-peach-light)' : 'var(--cth-mint-light)'
              }}>{t.status === 'blocked' ? 'Blocked' : 'Doing'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ ...muted, fontFamily: 'var(--cth-font-mono)', marginRight: 6 }}>{t.id}</span>
                  {t.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <Avatar agent={owner} />
                  <b style={{ fontSize: 13 }}>{nameOf(t.assignee)}</b>
                  {owner && <span style={{ marginLeft: 'auto' }}><StatusPill status={owner.status} /></span>}
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
