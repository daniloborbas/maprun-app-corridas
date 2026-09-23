'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { browserDb } from '@/lib/supabase/browser';

type Result = { label: string; ok: boolean; code?: string; message?: string };
const db = browserDb();
const fallback = 'Não executado';

function outcome(label: string, error: { code?: string; message?: string } | null, expectedBlocked = true, affected = false): Result {
  const blocked = Boolean(error) || !affected;
  return { label, ok: expectedBlocked ? blocked : !blocked, code: error?.code, message: error?.message || (blocked ? fallback : 'Operação permitida') };
}

export function RlsTestHarness() {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [eventId, setEventId] = useState('');
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [otherUserId, setOtherUserId] = useState('');
  const [favoriteId, setFavoriteId] = useState('');
  const [attendanceId, setAttendanceId] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState('');
  const [profileValue, setProfileValue] = useState('');

  useEffect(() => {
    if (!db) return;
    let active = true;
    void (async () => {
      const { data: auth } = await db.auth.getUser();
      if (!active) return;
      setUser(auth.user);
      if (!auth.user) return;
      const [{ data: p }, { data: races }] = await Promise.all([
        db.from('profiles').select('role,name').eq('id', auth.user.id).single(),
        db.from('events').select('id,name').eq('status', 'published').is('deleted_at', null).order('start_date').limit(25),
      ]);
      setAdmin(p?.role === 'admin');
      setProfileValue(p?.name || '');
      setEvents(races || []);
      setEventId(races?.[0]?.id || '');
    })();
    return () => { active = false; };
  }, []);

  const ownCreate = async (table: 'favorites' | 'event_attendance') => {
    if (!db || !user || !eventId) return;
    const { data, error } = await db.from(table).insert({ user_id: user.id, event_id: eventId }).select('user_id,event_id').single();
    if (error) { setStatus(`${table}: ${error.message}`); return; }
    setStatus(`${table} criado para teste.`);
    if (table === 'favorites') setFavoriteId(`${data.user_id}:${data.event_id}`);
    else setAttendanceId(`${data.user_id}:${data.event_id}`);
  };

  const runCrossUser = async () => {
    if (!db || !user || !otherUserId || !eventId) return;
    const next: Result[] = [];
    const favParts = favoriteId.split(':');
    const attParts = attendanceId.split(':');
    const favEvent = favParts[1] || eventId;
    const attEvent = attParts[1] || eventId;
    const favoriteDelete = await db.from('favorites').delete().eq('user_id', otherUserId).eq('event_id', favEvent).select('user_id,event_id');
    next.push(outcome('Favorites delete de outro usuário', favoriteDelete.error, true, (favoriteDelete.data || []).length > 0));
    const favoriteInsert = await db.from('favorites').insert({ user_id: otherUserId, event_id: eventId }).select('user_id,event_id');
    next.push(outcome('Favorites insert como outro usuário', favoriteInsert.error, true, (favoriteInsert.data || []).length > 0));
    const attendanceDelete = await db.from('event_attendance').delete().eq('user_id', otherUserId).eq('event_id', attEvent).select('user_id,event_id');
    next.push(outcome('Attendance delete de outro usuário', attendanceDelete.error, true, (attendanceDelete.data || []).length > 0));
    const attendanceInsert = await db.from('event_attendance').insert({ user_id: otherUserId, event_id: eventId }).select('user_id,event_id');
    next.push(outcome('Attendance insert como outro usuário', attendanceInsert.error, true, (attendanceInsert.data || []).length > 0));
    const profileUpdate = await db.from('profiles').update({ name: profileValue }).eq('id', otherUserId).select('id');
    next.push(outcome('Profile update de outro usuário', profileUpdate.error, true, (profileUpdate.data || []).length > 0));
    const file = new Blob(['rls-test'], { type: 'text/plain' });
    next.push(outcome('Storage write no path de outro usuário', (await db.storage.from('avatars').upload(`${otherUserId}/rls-test.txt`, file, { upsert: true })).error));
    next.push(outcome('Storage delete no path de outro usuário', (await db.storage.from('avatars').remove([`${otherUserId}/rls-test.txt`])).error));
    const adminProbe = await db.rpc('save_event', { payload: { slug: `rls-probe-${user.id.slice(0, 8)}`, name: 'RLS probe', short_description: '', description: '', start_date: new Date(Date.now() + 86400000).toISOString(), city: 'RLS', state: 'MG', venue: '', address: '', organizer_name: '', status: 'draft', event_category: 'rua', official_url: '', registration_url: '', regulation_url: '', cover_image_url: '/images/runners.jpg', cover_image_source: 'fallback', has_usable_official_image: false, organizer_verified: false, event_distances: [{ label: '5 km', distance_km: 5, category: 'rua', start_time: '', price_from: null, order_index: 0 }], source_name: 'RLS probe', source_url: '', source_method: 'manual' } });
    next.push(outcome('Admin RPC save_event', adminProbe.error, true, !adminProbe.error));
    setResults(next);
  };

  const cleanup = async () => {
    if (!db || !user || !eventId) return;
    await Promise.all([
      db.from('favorites').delete().eq('user_id', user.id).eq('event_id', eventId),
      db.from('event_attendance').delete().eq('user_id', user.id).eq('event_id', eventId),
    ]);
    setStatus('Registros temporários próprios removidos.');
  };

  if (!db) return <section className="page"><h1>Temporary RLS Test Harness</h1><p>Supabase não configurado.</p></section>;
  if (!user) return <section className="page"><h1>Temporary RLS Test Harness</h1><p>Faça login para continuar.</p></section>;
  return <section className="page rls-harness" style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>
    <p><strong>Temporary RLS Test Harness</strong> · uso interno, sem link público</p>
    <h1>Validação RLS cross-user</h1>
    <p><strong>Usuário atual:</strong> {user.id}<br /><strong>E-mail:</strong> {user.email || 'indisponível'}<br /><strong>is_admin:</strong> {admin ? 'true' : 'false'}</p>
    <hr />
    <h2>Passo A — conta A</h2>
    <label>Evento de teste<select value={eventId} onChange={e => setEventId(e.target.value)}>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
    <div className="button-row"><button className="button secondary" onClick={() => void ownCreate('favorites')}>Criar favorite próprio</button><button className="button secondary" onClick={() => void ownCreate('event_attendance')}>Criar attendance próprio</button></div>
    <p>Favorite id: <code>{favoriteId || '—'}</code><br />Attendance id: <code>{attendanceId || '—'}</code></p>
    <h2>Passo B — conta B</h2>
    <label>User ID da conta A<input value={otherUserId} onChange={e => setOtherUserId(e.target.value)} placeholder="UUID da conta A" /></label>
    <button className="button" onClick={() => void runCrossUser()}>Executar testes cross-user</button>
    {status && <p role="status">{status}</p>}
    {results.length > 0 && <div aria-live="polite"><h2>Resultados</h2>{results.map(r => <p key={r.label}><strong>{r.ok ? 'PASS' : 'FAIL'}</strong> — {r.label}<br /><small>{r.code || ''} {r.message}</small></p>)}</div>}
    <button className="text-button" onClick={() => void cleanup()}>Limpar somente registros próprios</button>
  </section>;
}
