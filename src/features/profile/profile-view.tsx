'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserRound, MapPin, Bookmark, Heart, Route, Mountain, LogOut } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { signOut } from '@/features/auth/actions';
import { saveProfile } from './actions';
import { LocationPicker } from '@/features/location/location-picker';
export interface ProfileData {
  name: string;
  city: string;
  state: string;
  favorite_distances: number[];
  preferred_categories: string[];
  alerts_enabled?: boolean; nearby_events_enabled?: boolean; city_events_enabled?: boolean; saved_event_reminders_enabled?: boolean; preferred_radius_km?: number;
  role?: string;
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
  const router = useRouter();
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
        <div className="avatar">
          <UserRound size={44} strokeWidth={1.3} />
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
