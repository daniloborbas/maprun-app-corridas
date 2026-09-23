'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { MapPin, Bookmark, Heart, Route, Mountain, LogOut } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { signOut } from '@/features/auth/actions';
import { saveProfile, updateAvatarUrl } from './actions';
import { LocationPicker } from '@/features/location/location-picker';
import { browserDb } from '@/lib/supabase/browser';
import { UserAvatar } from '@/components/user-avatar';
export interface ProfileData {
  name: string;
  city: string;
  state: string;
  favorite_distances: number[];
  preferred_categories: string[];
  alerts_enabled?: boolean; nearby_events_enabled?: boolean; city_events_enabled?: boolean; saved_event_reminders_enabled?: boolean; preferred_radius_km?: number;
  role?: string;
  avatar_url?: string | null;
}
const blank: ProfileData = {
  name: '',
  city: '',
  state: '',
  favorite_distances: [],
  preferred_categories: [],
};
export function ProfileView({
  profile,
  authError,
}: {
  profile: ProfileData | null;
  authError?: boolean;
}) {
  const { user, demo, favorites, going, login, notify } = useApp();
  const [editing, setEditing] = useState(false),
    [form, setForm] = useState(profile || blank),
    [busy, setBusy] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null),
    [avatarFile, setAvatarFile] = useState<File | null>(null),
    [avatarBusy, setAvatarBusy] = useState(false);
  const router = useRouter();
  async function chooseAvatar(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      notify(file.size > 5 * 1024 * 1024 ? 'A foto deve ter no máximo 5 MB.' : 'Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    const preview = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreview(preview);
  }
  async function saveAvatar() {
    if (!avatarFile || !user) return;
    setAvatarBusy(true);
    try {
      const client = browserDb();
      if (!client) throw new Error('Supabase indisponível');
      const bitmap = await createImageBitmap(avatarFile);
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 512;
      const scale = Math.max(512 / bitmap.width, 512 / bitmap.height);
      const width = bitmap.width * scale, height = bitmap.height * scale;
      canvas.getContext('2d')?.drawImage(bitmap, (512 - width) / 2, (512 - height) / 2, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!blob) throw new Error('Conversão inválida');
      const path = `${user.id}/profile.webp`;
      const upload = await client.storage.from('avatars').upload(path, blob, { contentType: 'image/webp', upsert: true, cacheControl: '3600' });
      if (upload.error) throw upload.error;
      const publicUrl = client.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      const result = await updateAvatarUrl(`${publicUrl}?v=${Date.now()}`);
      if (result.error) throw new Error(result.error);
      notify('Foto de perfil atualizada.'); setAvatarFile(null); setAvatarPreview(null); router.refresh();
    } catch { notify('Não foi possível salvar a foto. Tente novamente.'); }
    finally { setAvatarBusy(false); }
  }
  async function removeAvatar() {
    if (!user) return;
    setAvatarBusy(true);
    try {
      const client = browserDb();
      const result = client ? await client.storage.from('avatars').remove([`${user.id}/profile.webp`]) : { error: new Error('Supabase indisponível') };
      if (result.error) throw result.error;
      const saved = await updateAvatarUrl(null);
      if (saved.error) throw new Error(saved.error);
      notify('Foto removida.'); router.refresh();
    } catch { notify('Não foi possível remover a foto.'); }
    finally { setAvatarBusy(false); }
  }
  return (
    <div className="page profile-page">
      <header className="page-heading">
        <h1>Perfil</h1>
      </header>
      {authError && (
        <p className="error-message" role="alert">
          Este link expirou ou já foi utilizado. Solicite um novo link para entrar.
        </p>
      )}
      <section className="profile-identity">
        <div className="avatar-upload">
          <UserAvatar name={user ? profile?.name : null} avatarUrl={profile?.avatar_url} googleAvatarUrl={user?.googleAvatarUrl} size={96} />
          {user && <div className="avatar-actions"><label className="button secondary">Alterar foto<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) void chooseAvatar(file); e.currentTarget.value = ''; }} /></label>{profile?.avatar_url && <button type="button" className="text-button" onClick={() => void removeAvatar()} disabled={avatarBusy}>Remover foto</button>}</div>}
          {avatarPreview && <><Image className="avatar-preview" src={avatarPreview} alt="Prévia da nova foto" width={96} height={96} unoptimized /><div className="avatar-actions"><button type="button" className="button" onClick={() => void saveAvatar()} disabled={avatarBusy}>{avatarBusy ? 'Salvando…' : 'Salvar foto'}</button><button type="button" className="text-button" onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}>Cancelar</button></div></>}
        </div>
        <h2>{user ? profile?.name || 'Seu perfil de corredor' : 'Sua história começa aqui'}</h2>
        <p>
          {profile?.city ? (
            <>
              <MapPin size={15} />
              {profile.city} · {profile.state}
            </>
          ) : (
            'Novos lugares. Mais corridas. Mais você.'
          )}
        </p>
        <button
          className="button secondary"
          onClick={() => (user ? setEditing(!editing) : login())}
        >
          {user ? 'Editar perfil' : 'Entrar ou criar conta'}
        </button>
        {demo && (
          <small className="demo-note">
            Demonstração: salvos e “Eu vou” ficam somente neste navegador.
          </small>
        )}
      </section>
      {editing && (
        <form
          className="profile-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const result = await saveProfile(form);
            setBusy(false);
            if (result.error) notify(result.error);
            else {
              notify('Perfil atualizado.');
              setEditing(false);
              router.refresh();
            }
          }}
        >
          <label>
            Nome
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <div className="form-row">
            <label>
              Cidade
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </label>
            <label>
              UF
              <input
                maxLength={2}
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
              />
            </label>
          </div>
          <fieldset>
            <legend>Distâncias favoritas</legend>
            <div className="checkbox-row">
              {[5, 10, 21, 42].map((n) => (
                <label key={n}>
                  <input
                    type="checkbox"
                    checked={form.favorite_distances.includes(n)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        favorite_distances: e.target.checked
                          ? [...form.favorite_distances, n]
                          : form.favorite_distances.filter((d) => d !== n),
                      })
                    }
                  />
                  {n} km
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Tipos de prova</legend>
            <div className="checkbox-row">
              {[
                ['rua', 'Rua'],
                ['trail', 'Trilha'],
                ['night', 'Noturna'],
                ['kids', 'Infantil'],
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={form.preferred_categories.includes(key)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        preferred_categories: e.target.checked
                          ? [...form.preferred_categories, key]
                          : form.preferred_categories.filter((c) => c !== key),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar perfil'}
          </button>
          <fieldset><legend>Seus alertas</legend><div className="checkbox-row">{[['nearby_events_enabled','Novas corridas perto de mim'],['city_events_enabled','Novas corridas na minha cidade'],['saved_event_reminders_enabled','Lembrar corridas salvas']].map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean(form[key as keyof ProfileData])} onChange={e=>setForm({...form,[key]:e.target.checked})}/>{label}</label>)}</div><label>Raio de proximidade<select value={form.preferred_radius_km||50} onChange={e=>setForm({...form,preferred_radius_km:Number(e.target.value)})}><option value="25">25 km</option><option value="50">50 km</option><option value="100">100 km</option><option value="200">200 km</option></select></label></fieldset>
        </form>
      )}
      <section className="profile-section">
        <h3>Seus alertas</h3><div className="preference-row"><Route className="green"/><div><span>{profile?.alerts_enabled?'Alertas ativados':'Entre para receber alertas de novas corridas'}</span><p>{profile?.nearby_events_enabled?'Perto de você':'Configure seus alertas ao editar o perfil.'}</p></div></div>
        <h3>Minhas preferências</h3>
        <div className="preference-row">
          <Route className="green" />
          <div>
            <span>Distâncias preferidas</span>
            <p>
              {profile?.favorite_distances.length
                ? profile.favorite_distances.map((d) => `${d} km`).join(' · ')
                : 'Um novo desafio à sua escolha'}
            </p>
          </div>
        </div>
        <div className="preference-row">
          <Mountain />
          <div>
            <span>Tipos de prova</span>
            <p>
              {profile?.preferred_categories.length
                ? profile.preferred_categories.join(' · ')
                : 'Rua · Trilha · Montanha'}
            </p>
          </div>
        </div>
        <div className="preference-row">
          <MapPin />
          <div>
            <span>Minha região</span>
            <LocationPicker />
          </div>
        </div>
      </section>
      <section className="profile-section">
        <h3>Minha atividade</h3>
        <div className="activity-grid">
          <Link href="/salvos">
            <Bookmark className="green" />
            <strong>{favorites.length}</strong>
            <span>Eventos salvos</span>
          </Link>
          <Link href="/salvos">
            <Heart className="green" />
            <strong>{going.length}</strong>
            <span>Eu vou</span>
          </Link>
        </div>
      </section>
      <blockquote>
        “Novos lugares.
        <br />
        Mais corridas. Uma versão
        <br />
        mais feliz de mim.”
        <span />
      </blockquote>
      <div className="profile-footer">
        <Link href="/privacidade">Privacidade e dados</Link>
        {profile?.role === 'admin' && <Link href="/admin">Administração</Link>}
        {user && (
          <button
            className="text-button"
            onClick={async () => {
              await signOut();
              router.refresh();
              window.location.reload();
            }}
          >
            <LogOut size={16} />
            Sair da conta
          </button>
        )}
      </div>
    </div>
  );
}
