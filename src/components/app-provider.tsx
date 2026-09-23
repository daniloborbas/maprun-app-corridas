'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X, ArrowRight, Mail } from 'lucide-react';
import { sendLoginLink } from '@/features/auth/actions';
import { browserDb } from '@/lib/supabase/browser';
import { setEventInteraction } from '@/features/events/actions';
import { trackAnalyticsEvent } from '@/features/analytics/client';
import type { Coordinates } from '@/features/events/types';
import { LOCATION_PREFERENCE_KEY, LOCATION_RADIUS_OPTIONS, normalizeLocationPreference } from '@/features/location/preference';
export interface LocationPreference extends Coordinates {
  label: string;
  mode?: 'manual' | 'geolocation';
  city?: string;
  state?: string;
  radiusKm?: number;
  updatedAt?: string;
  precise?: boolean;
}
interface AppContextValue {
  user: { id: string; name: string } | null;
  demo: boolean;
  favorites: string[];
  going: string[];
  location: LocationPreference | null;
  setLocation: (value: LocationPreference | null) => void;
  setRadius: (radiusKm: number) => void;
  toggle: (id: string, kind: 'favorite' | 'going') => Promise<void>;
  login: () => void;
  notify: (message: string) => void;
}
const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('MapRun provider missing');
  return value;
}
export function AppProvider({
  children,
  user,
  demo,
  initialFavorites,
  initialGoing,
}: {
  children: React.ReactNode;
  user: AppContextValue['user'];
  demo: boolean;
  initialFavorites: string[];
  initialGoing: string[];
}) {
  const [favorites, setFavorites] = useState(initialFavorites),
    [going, setGoing] = useState(initialGoing);
  const [location, updateLocation] = useState<LocationPreference | null>(null);
  const [showLogin, setShowLogin] = useState(false),
    [loginTarget, setLoginTarget] = useState('/perfil'),
    [toast, setToast] = useState('');
  const [email, setEmail] = useState(''),
    [loginMessage, setLoginMessage] = useState(''),
    [sending, setSending] = useState(false);
  const [consent, setConsent] = useState<string | null>('loading');
  const pathname = usePathname(),
    router = useRouter();
  const notify = useCallback((message: string) => setToast(message), []);
  // Restore browser-only preferences after hydration; never expose demo storage to real accounts.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCATION_PREFERENCE_KEY) || localStorage.getItem('maprun.location') || 'null');
      const restored = normalizeLocationPreference(saved);
      if (restored) updateLocation(restored);
      if (saved?.mode === 'geolocation' && navigator.geolocation && navigator.permissions) {
        void navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
          if (permission.state === 'granted') navigator.geolocation.getCurrentPosition((position) => updateLocation((current) => current ? { ...current, latitude: position.coords.latitude, longitude: position.coords.longitude, updatedAt: new Date().toISOString(), precise: true } : current), () => {} , { maximumAge: 300000, timeout: 10000 });
        }).catch(() => {});
      }
      if (demo) {
        const restoredFavorites: unknown = JSON.parse(localStorage.getItem('maprun.demo.favorites') || '[]');
        const restoredGoing: unknown = JSON.parse(localStorage.getItem('maprun.demo.going') || '[]');
        if (Array.isArray(restoredFavorites)) setFavorites(restoredFavorites.filter((id): id is string => typeof id === 'string'));
        if (Array.isArray(restoredGoing)) setGoing(restoredGoing.filter((id): id is string => typeof id === 'string'));
      }
      setConsent(localStorage.getItem('maprun.analytics'));
    } catch {
      setConsent(null);
    }
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production')
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, [demo]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    if (params.get('login') === '1') {
      const target = next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/perfil';
      setLoginTarget(target);
      setShowLogin(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    trackAnalyticsEvent('page_view');
  }, [pathname]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (!showLogin) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowLogin(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showLogin]);
  function setLocation(value: LocationPreference | null) {
    const next = value ? { ...value, mode: value.mode || (value.precise ? 'geolocation' : 'manual'), radiusKm: value.radiusKm || location?.radiusKm || 100, updatedAt: new Date().toISOString() } : null;
    updateLocation(next);
    if (next) localStorage.setItem(LOCATION_PREFERENCE_KEY, JSON.stringify(next));
    else localStorage.removeItem(LOCATION_PREFERENCE_KEY);
  }
  function setRadius(radiusKm: number) {
    if (!location || !LOCATION_RADIUS_OPTIONS.includes(radiusKm as (typeof LOCATION_RADIUS_OPTIONS)[number])) return;
    setLocation({ ...location, radiusKm });
  }
  async function toggle(id: string, kind: 'favorite' | 'going') {
    if (!demo && !user) {
      setShowLogin(true);
      return;
    }
    const list = kind === 'favorite' ? favorites : going,
      active = !list.includes(id);
    if (!demo) {
      const result = await setEventInteraction(id, kind, active);
      if (result.error) {
        notify(result.error);
        if (result.needsLogin) setShowLogin(true);
        return;
      }
    }
    const next = active ? [...list, id] : list.filter((item) => item !== id);
    if (kind === 'favorite') setFavorites(next);
    else setGoing(next);
    if (demo)
      localStorage.setItem(
        `maprun.demo.${kind === 'favorite' ? 'favorites' : 'going'}`,
        JSON.stringify(next),
      );
    trackAnalyticsEvent(
      kind === 'favorite'
        ? active
          ? 'race_save'
          : 'race_unsave'
        : active
          ? 'going_add'
          : 'going_remove',
      id,
    );
    notify(
      active
        ? kind === 'favorite'
          ? 'Corrida salva para depois.'
          : 'Sua próxima linha de chegada!'
        : 'Seleção removida.',
    );
  }
  function chooseConsent(value: string) {
    localStorage.setItem('maprun.analytics', value);
    setConsent(value);
    if (value === 'yes') trackAnalyticsEvent('page_view');
  }
  async function signInWithGoogle() {
    const client = browserDb();
    if (!client) {
      setLoginMessage('O login estará disponível quando o Supabase for conectado.');
      return;
    }
    const target = loginTarget.startsWith('/') && !loginTarget.startsWith('//') && !loginTarget.includes('\\') ? loginTarget : '/perfil';
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}` },
    });
    if (error) setLoginMessage('Não foi possível iniciar o login com Google. Tente novamente.');
  }
  return (
    <AppContext.Provider
      value={{
        user,
        demo,
        favorites,
        going,
        location,
        setLocation,
        setRadius,
        toggle,
        login: () => {
          setLoginMessage('');
          setShowLogin(true);
        },
        notify,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {consent === null && !demo && (
        <div className="consent">
          <p>
            Podemos usar métricas anônimas para melhorar a descoberta de corridas?{' '}
            <a href="/privacidade">Saiba mais</a>
          </p>
          <button onClick={() => chooseConsent('no')}>Agora não</button>
          <button className="button" onClick={() => chooseConsent('yes')}>
            Permitir
          </button>
        </div>
      )}
      {showLogin && (
        <div className="modal-backdrop" onClick={() => setShowLogin(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                const controls = e.currentTarget.querySelectorAll<HTMLElement>('button,input,a');
                const first = controls[0],
                  last = controls[controls.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              className="icon-button modal-close"
              aria-label="Fechar"
              onClick={() => setShowLogin(false)}
            >
              <X />
            </button>
            <Mail className="green" size={32} />
            <h2 id="login-title">
              Suas próximas corridas,
              <br />
              em um só lugar.
            </h2>
            <p>Entre com seu e-mail para salvar provas e marcar onde você vai correr.</p>
            <button type="button" className="button secondary full" onClick={() => void signInWithGoogle()}>
              Continuar com Google
            </button>
            <div className="login-divider" aria-hidden="true"><span>ou</span></div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSending(true);
                const result = await sendLoginLink(email, loginTarget);
                setSending(false);
                setLoginMessage(result.error || 'Link enviado! Abra seu e-mail para entrar.');
                router.refresh();
              }}
            >
              <label>
                E-mail
                <input
                  autoFocus
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                />
              </label>
              <button className="button full" disabled={sending}>
                {sending ? 'Enviando…' : 'Receber link de acesso'}
                <ArrowRight size={18} />
              </button>
            </form>
            <p role="status">{loginMessage}</p>
            <small>Sem senha. Sem complicação.</small>
          </section>
        </div>
      )}
    </AppContext.Provider>
  );
}
