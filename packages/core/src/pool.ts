import { ElectrumClient } from '@electrum-cash/network';
import type { ChainSource } from './types.js';

/** Public Fulcrum servers checked healthy on 19 Nov 2026 (WSS, port 50004). */
export const DEFAULT_MAINNET_SERVERS = [
  'bch.imaginary.cash',
  'bch.loping.net',
  'fulcrum.greyh.at',
  'electrum.imaginary.cash',
];

export interface PoolOptions {
  servers?: string[];
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Application name sent in server.version. */
  application?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms} ms: ${label}`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * A pool of independent Electrum/Fulcrum servers. Using several servers lets us
 * notice when servers disagree about the mempool (a symptom of racing double spends).
 */
export class FulcrumPool implements ChainSource {
  private clients = new Map<string, ElectrumClient<any>>();
  private readonly servers: string[];
  private readonly timeoutMs: number;
  private readonly application: string;

  constructor(opts: PoolOptions = {}) {
    this.servers = opts.servers ?? DEFAULT_MAINNET_SERVERS;
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.application = opts.application ?? 'settled';
  }

  /** Connect to every server; servers that fail are skipped. Resolves with connected hosts. */
  async connect(): Promise<string[]> {
    await Promise.all(
      this.servers.map(async (host) => {
        const client = new ElectrumClient(this.application, '1.5', host);
        try {
          await withTimeout(client.connect(), this.timeoutMs, `connect ${host}`);
          this.clients.set(host, client);
        } catch {
          client.disconnect(true).catch(() => {});
        }
      }),
    );
    if (this.clients.size === 0) throw new Error('could not connect to any Fulcrum server');
    return this.hosts();
  }

  hosts(): string[] {
    return [...this.clients.keys()];
  }

  client(host: string): ElectrumClient<any> | undefined {
    return this.clients.get(host);
  }

  async request<T = unknown>(method: string, ...params: unknown[]): Promise<T> {
    let lastError: unknown;
    for (const [host, client] of this.clients) {
      try {
        const r = await withTimeout(client.request(method, ...(params as any[])), this.timeoutMs, `${method} @${host}`);
        if (r instanceof Error) throw r;
        return r as T;
      } catch (e) {
        lastError = e;
        // Electrum "not found" style errors are answers, not outages: return them to the caller.
        if (isNotFound(e)) throw e;
      }
    }
    throw lastError ?? new Error('no servers');
  }

  async requestAll<T = unknown>(method: string, ...params: unknown[]) {
    return Promise.all(
      [...this.clients].map(async ([host, client]) => {
        try {
          const r = await withTimeout(client.request(method, ...(params as any[])), this.timeoutMs, `${method} @${host}`);
          if (r instanceof Error) return { host, error: r.message };
          return { host, result: r as T };
        } catch (e) {
          return { host, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
  }

  async close(): Promise<void> {
    await Promise.all([...this.clients.values()].map((c) => c.disconnect(true).catch(() => false)));
    this.clients.clear();
  }
}

export function isNotFound(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /no such|not found|unknown transaction|missing/i.test(m);
}
