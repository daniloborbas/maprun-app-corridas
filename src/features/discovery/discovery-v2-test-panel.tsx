'use client';
import { useState } from 'react';

export const DISCOVERY_V2_DISCOVER_REQUEST = { action: 'discover', sourceLimit: 3 } as const;

type DiscoveryResponse = {
  discovery?: {
    sourcesProcessed: number;
    sourcesSucceeded: number;
    sourcesFailed: number;
    urlsFound: number;
    candidatesNew: number;
    candidatesExisting: number;
    candidatesPersisted: number;
    durationMs: number;
    errors: { source: string; error: string }[];
  };
  candidates?: { url: string; source: string; titleHint: string | null; discoveryMethod: string }[];
  error?: string;
};

export function DiscoveryV2TestPanel() {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  async function run() {
    setState('loading');
    setResult(null);
    try {
      const response = await fetch('/api/admin/discovery/dry-run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DISCOVERY_V2_DISCOVER_REQUEST) });
      const data = await response.json() as DiscoveryResponse;
      setResult(data);
      setState(response.ok ? 'success' : 'error');
    } catch {
      setResult({ error: 'Não foi possível executar a descoberta.' });
      setState('error');
    }
  }
  const summary = result?.discovery;
  return <section className="admin-note" aria-labelledby="discovery-v2-test-title">
    <strong id="discovery-v2-test-title">Discovery V2 — Teste</strong>
    <p>Execução manual controlada para avaliar URLs candidatas.</p>
    <button className="button" type="button" onClick={run} disabled={state === 'loading'}>{state === 'loading' ? 'Carregando…' : 'Executar discovery em 3 fontes'}</button>
    {state === 'error' && <p role="alert">{result?.error || 'Falha na descoberta.'}</p>}
    {state === 'success' && summary && <div role="status">
      <p>Sucesso · {summary.sourcesProcessed} fontes · {summary.urlsFound} URLs · {summary.candidatesNew} novas · {summary.candidatesExisting} existentes · {summary.candidatesPersisted} persistidas · {summary.durationMs} ms</p>
      {summary.errors.length > 0 && <ul>{summary.errors.map((error) => <li key={error.source}>{error.source}: {error.error}</li>)}</ul>}
      {(result.candidates || []).length > 0 && <div className="table-scroll"><table className="admin-table"><thead><tr><th>URL</th><th>Fonte</th><th>Title hint</th><th>Método</th></tr></thead><tbody>{result.candidates?.map((candidate) => <tr key={`${candidate.source}-${candidate.url}`}><td><a href={candidate.url} target="_blank" rel="noopener noreferrer">{candidate.url}</a></td><td>{candidate.source}</td><td>{candidate.titleHint || '—'}</td><td>{candidate.discoveryMethod}</td></tr>)}</tbody></table></div>}
    </div>}
  </section>;
}
