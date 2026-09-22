'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { saveAdminEvent, deleteAdminEvent } from './actions';
import type { RaceEvent, EventDistance } from '@/features/events/types';
const toLocal = (v?: string | null) =>
  v ? new Date(new Date(v).getTime() - 3 * 3600000).toISOString().slice(0, 16) : '';
export function AdminEventForm({ event, forceDraft = false, sourceMethod = 'manual' }: { event?: RaceEvent; forceDraft?: boolean; sourceMethod?: string }) {
  const router = useRouter();
  const [distances, setDistances] = useState<EventDistance[]>(
    event?.event_distances || [{ label: '5 km', distance_km: 5, category: 'rua' }],
  );
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [deleteConfirm, setDeleteConfirm] = useState(false);
  const field = (name: string, label: string, value = '', type = 'text', required = false) => (
    <label>
      {label}
      <input name={name} type={type} defaultValue={value} required={required} />
    </label>
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const data = new FormData(e.currentTarget);
    const text = (key: string) => String(data.get(key) || '');
    const num = (key: string) => (text(key) === '' ? null : Number(text(key)));
    const result = await saveAdminEvent({
      id: event?.id && event.id.length > 10 ? event.id : undefined,
      name: text('name'),
      slug: text('slug'),
      short_description: text('short_description'),
      description: text('description'),
      start_date: `${text('start_date')}:00-03:00`,
      end_date: text('end_date') ? `${text('end_date')}:00-03:00` : null,
      city: text('city'),
      state: text('state').toUpperCase(),
      country: 'BR',
      venue: text('venue'),
      address: text('address'),
      latitude: num('latitude'),
      longitude: num('longitude'),
      organizer_name: text('organizer_name'),
      event_category: text('event_category'),
      official_url: text('official_url'),
      registration_url: text('registration_url'),
      regulation_url: text('regulation_url'),
      price_from: num('price_from'),
      cover_image_url: text('cover_image_url') || '/images/runners.jpg',
      cover_image_source: text('cover_image_source'),
      has_usable_official_image: data.has('has_usable_official_image'),
      short_tagline: text('short_tagline'),
      status: forceDraft ? 'draft' : text('status'),
      organizer_verified: data.has('organizer_verified'),
      event_distances: distances.map((d, i) => ({ ...d, order_index: i })),
      source_name: sourceMethod === 'url' ? 'Importação por URL' : text('source_name'),
      source_url: text('source_url'),
      source_method: sourceMethod,
    });
    setBusy(false);
    if (result.error) setMessage(result.error);
    else {
      setMessage('Evento salvo.');
      router.push('/admin/eventos');
      router.refresh();
    }
  }
  return (
    <>
      <form className="admin-form" onSubmit={submit}>
        {field('name', 'Nome da corrida', event?.name, 'text', true)}
        {field('slug', 'Slug público (ex.: corrida-da-serra-2026)', event?.slug, 'text', true)}
        <label>
          Status
          <select name="status" defaultValue={event?.status || 'draft'}>
            <option value="draft">Rascunho</option>
            <option value="published">Publicada</option>
            <option value="cancelled">Cancelada</option>
            <option value="finished">Encerrada</option>
            <option value="archived">Arquivada</option>
          </select>
        </label>
        <label>
          Categoria
          <select name="event_category" defaultValue={event?.event_category || 'rua'}>
            <option value="rua">Rua</option>
            <option value="trail">Trail</option>
            <option value="night">Night run</option>
            <option value="kids">Infantil</option>
          </select>
        </label>
        {field(
          'start_date',
          'Largada (horário de Brasília)',
          toLocal(event?.start_date),
          'datetime-local',
          true,
        )}
        {field(
          'end_date',
          'Término (horário de Brasília)',
          toLocal(event?.end_date),
          'datetime-local',
        )}
        {field('city', 'Cidade', event?.city, 'text', true)}
        {field('state', 'UF', event?.state, 'text', true)}
        {field('venue', 'Local de largada', event?.venue)}
        {field('address', 'Endereço', event?.address)}
        <label>
          Latitude
          <input
            name="latitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            defaultValue={event?.latitude ?? ''}
          />
        </label>
        <label>
          Longitude
          <input
            name="longitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            defaultValue={event?.longitude ?? ''}
          />
        </label>
        {field('organizer_name', 'Organizador', event?.organizer_name)}
        <label>
          Preço inicial (R$)
          <input
            name="price_from"
            type="number"
            min="0"
            step="0.01"
            defaultValue={event?.price_from ?? ''}
          />
        </label>
        {field('registration_url', 'URL de inscrição (HTTPS)', event?.registration_url, 'url')}
        {field('official_url', 'Site oficial (HTTPS)', event?.official_url, 'url')}
        {field('regulation_url', 'Regulamento (HTTPS)', event?.regulation_url, 'url')}
        {field('cover_image_url', 'URL da capa ou caminho do fallback', event?.cover_image_url)}
        <label>
          Origem da imagem
          <select name="cover_image_source" defaultValue={event?.cover_image_source || 'fallback'}>
            <option value="fallback">Template fallback</option>
            <option value="official">Oficial</option>
            <option value="generated">Gerada</option>
          </select>
        </label>
        {field('short_tagline', 'Frase curta da capa', event?.short_tagline)}
        <label className="checkbox-label">
          <input
            name="has_usable_official_image"
            type="checkbox"
            defaultChecked={event?.has_usable_official_image}
          />
          Imagem oficial utilizável
        </label>
        <label className="checkbox-label">
          <input
            name="organizer_verified"
            type="checkbox"
            defaultChecked={event?.organizer_verified}
          />
          Verificado pelo organizador
        </label>
        <label className="wide">
          Descrição curta
          <input name="short_description" maxLength={240} defaultValue={event?.short_description} />
        </label>
        <label className="wide">
          Descrição completa
          <textarea name="description" defaultValue={event?.description} />
        </label>
        <fieldset className="wide">
          <legend>Distâncias e modalidades</legend>
          {distances.map((distance, i) => (
            <div className="admin-distance" key={i}>
              <input
                aria-label={`Nome da distância ${i + 1}`}
                required
                value={distance.label}
                onChange={(e) =>
                  setDistances(
                    distances.map((d, j) => (i === j ? { ...d, label: e.target.value } : d)),
                  )
                }
              />
              <input
                aria-label={`Quilômetros ${i + 1}`}
                type="number"
                step="0.1"
                min="0"
                value={distance.distance_km ?? ''}
                onChange={(e) =>
                  setDistances(
                    distances.map((d, j) =>
                      i === j
                        ? {
                            ...d,
                            distance_km: e.target.value === '' ? null : Number(e.target.value),
                          }
                        : d,
                    ),
                  )
                }
              />
              <input
                aria-label={`Modalidade ${i + 1}`}
                value={distance.category}
                onChange={(e) =>
                  setDistances(
                    distances.map((d, j) => (i === j ? { ...d, category: e.target.value } : d)),
                  )
                }
              />
              <button
                type="button"
                aria-label={`Remover distância ${i + 1}`}
                disabled={distances.length === 1}
                onClick={() => setDistances(distances.filter((_, j) => i !== j))}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setDistances([...distances, { label: '', distance_km: null, category: 'rua' }])
            }
          >
            <Plus size={17} />
            Adicionar distância
          </button>
        </fieldset>
        {field(
          'source_name',
          'Nome da fonte',
          event?.event_sources?.[0]?.source_name || 'Cadastro manual',
        )}
        {field('source_url', 'URL da fonte', event?.event_sources?.[0]?.source_url, 'url')}
        <div className="wide">
          <p className="error-message" role="status" hidden={!message}>
            {message}
          </p>
          <button className="button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar evento'}
          </button>
        </div>
      </form>
      {event && (
        <div style={{ marginTop: 30 }}>
          <button className="text-button" onClick={() => setDeleteConfirm(!deleteConfirm)}>
            Excluir logicamente
          </button>
          {deleteConfirm && (
            <div className="error-message">
              <p>O evento sairá das páginas públicas. O registro será preservado no banco.</p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const result = await deleteAdminEvent(event.id);
                  setBusy(false);
                  if (result.error) setMessage(result.error);
                  else {
                    router.push('/admin/eventos');
                    router.refresh();
                  }
                }}
              >
                Confirmar exclusão
              </button>
              <button className="text-button" onClick={() => setDeleteConfirm(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
