'use client';
import { useState } from 'react';
import { MapPin, LocateFixed, ChevronDown } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { trackAnalyticsEvent } from '@/features/analytics/client';
export const cities = [
  { label: 'Itajubá, MG', latitude: -22.425, longitude: -45.452 },
  { label: 'Belo Horizonte, MG', latitude: -19.919, longitude: -43.938 },
  { label: 'São Paulo, SP', latitude: -23.551, longitude: -46.633 },
  { label: 'Rio de Janeiro, RJ', latitude: -22.907, longitude: -43.173 },
  { label: 'Campos do Jordão, SP', latitude: -22.739, longitude: -45.592 },
  { label: 'Pouso Alegre, MG', latitude: -22.23, longitude: -45.936 },
  { label: 'Curitiba, PR', latitude: -25.429, longitude: -49.272 },
  { label: 'Brasília, DF', latitude: -15.794, longitude: -47.883 },
  { label: 'Porto Alegre, RS', latitude: -30.034, longitude: -51.218 },
  { label: 'Salvador, BA', latitude: -12.977, longitude: -38.501 },
  { label: 'Recife, PE', latitude: -8.054, longitude: -34.881 },
  { label: 'Fortaleza, CE', latitude: -3.732, longitude: -38.527 },
  { label: 'São Lourenço, MG', latitude: -22.116, longitude: -45.054 },
  { label: 'Gonçalves, MG', latitude: -22.658, longitude: -45.855 },
  { label: 'Santos, SP', latitude: -23.961, longitude: -46.333 },
  { label: 'Campinas, SP', latitude: -22.909, longitude: -47.062 },
];
export function LocationPicker() {
  const { location, setLocation, setRadius, notify } = useApp();
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false);
  function locate() {
    if (!navigator.geolocation) {
      notify('Seu navegador não oferece localização. Escolha uma cidade.');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          label: 'Perto de você',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          mode: 'geolocation',
          precise: true,
        });
        setLoading(false);
        setOpen(false);
        trackAnalyticsEvent('location_permission_granted');
      },
      () => {
        setLoading(false);
        notify('Tudo bem! Você pode escolher uma cidade ou explorar o Brasil.');
        trackAnalyticsEvent('location_permission_denied');
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }
  return (
    <div className="location-picker">
      <button className="location-trigger" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MapPin size={17} />
        {location?.label || 'Escolha sua região'}
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="location-popover">
          <strong>De onde você vai partir?</strong>
          <p>
            Sua localização ajuda a encontrar provas próximas. Não acompanhamos seus deslocamentos.
          </p>
          <button className="button full" onClick={locate} disabled={loading}>
            <LocateFixed size={17} />
            {loading ? 'Localizando…' : 'Usar minha localização'}
          </button>
          <label>
            Ou escolha uma cidade
            <select
              aria-label="Cidade de referência"
              value={cities.some((c) => c.label === location?.label) ? location?.label : ''}
              onChange={(e) => {
                const city = cities.find((c) => c.label === e.target.value);
                setLocation(city || null);
                setOpen(false);
                trackAnalyticsEvent('manual_location_selected');
              }}
            >
              <option value="">Brasil inteiro</option>
              {cities.map((city) => (
                <option key={city.label}>{city.label}</option>
              ))}
            </select>
          </label>
          <label>
            Raio de busca
            <select aria-label="Raio de busca" value={location?.radiusKm || 100} onChange={(e) => setRadius(Number(e.target.value))}>
              <option value="25">25 km</option>
              <option value="50">50 km</option>
              <option value="100">100 km</option>
              <option value="200">200 km</option>
            </select>
          </label>
          <button
            className="text-button"
            onClick={() => {
              setLocation(null);
              setOpen(false);
            }}
          >
            Explorar sem localização
          </button>
        </div>
      )}
    </div>
  );
}
