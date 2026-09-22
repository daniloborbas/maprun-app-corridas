'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { saveAdminEvent, deleteAdminEvent } from './actions';
import type { RaceEvent, EventDistance } from '@/features/events/types';
export function slugify(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
const toLocal = (v?: string | null) =>
  v ? new Date(new Date(v).getTime() - 3 * 3600000).toISOString().slice(0, 16) : '';
export function AdminEventForm({ event, forceDraft = false, sourceMethod = 'manual' }: { event?: RaceEvent; forceDraft?: boolean; sourceMethod?: string }) {
  const router = useRouter();
  const [distances, setDistances] = useState<EventDistance[]>(
    event?.event_distances || [{ label: '5 km', distance_km: 5, category: 'rua' }],
  );
  const [message, setMessage] = useState(''),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [geocoding, setGeocoding] = useState(false),
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
    const errors: Record<string, string> = {};
    if (!text('name').trim()) errors.name = 'Informe o nome da corrida.';
    if (!text('slug').trim()) errors.slug = 'Informe o slug da corrida.';
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text('slug'))) errors.slug = 'O slug contém caracteres inválidos.';
    if (!text('start_date')) errors.start_date = 'Informe a data da corrida.';
    if (!/^[A-Z]{2}$/.test(text('state').toUpperCase())) errors.state = 'Use a sigla do estado com 2 letras.';
    const lat = num('latitude'), lon = num('longitude');
    if ((lat === null) !== (lon === null)) { errors.latitude = 'Latitude e longitude devem ser preenchidas juntas.'; errors.longitude = errors.latitude; }
    if (distances.length === 0) errors.distances = 'Adicione pelo menos uma distância.';
    for (const key of ['registration_url', 'official_url', 'regulation_url']) if (text(key) && !/^https:\/\//i.test(text(key))) errors[key] = 'Informe uma URL HTTPS válida.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) { setMessage('Revise os campos destacados abaixo.'); setBusy(false); const first = e.currentTarget.elements.namedItem(Object.keys(errors)[0]) as HTMLElement | null; first?.focus(); first?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    let result: Awaited<ReturnType<typeof saveAdminEvent>>;
    try {
      result = await saveAdminEvent({
      id: event?.id && event.id.length > 10 ? event.id : undefined,
      name: text('name'),
      slug: text('slug') || slugify(text('name')),
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar agora. Tente novamente.');
      setBusy(false);
      return;
    }
    setBusy(false);
    if (result.error) { const next = { ...fieldErrors }; if (result.error.includes('slug')) next.slug = result.error; else if (result.error.includes('coordenadas')) { next.latitude = result.error; next.longitude = result.error; } setFieldErrors(next); const safe = result.error.startsWith('Já existe') || result.error.startsWith('Este slug') || result.error.startsWith('Sua sessão') || result.error.startsWith('A categoria') || result.error.startsWith('Não foi possível salvar uma'); setMessage(safe ? result.error : 'Não foi possível salvar agora. Tente novamente.'); }
    else {
      setMessage('Evento salvo.');
      router.push('/admin/eventos');
      router.refresh();
    }
  }
  const input = (name: string, label: string, value = '', type = 'text', required = false) => <label className={fieldErrors[name] ? 'has-error' : ''}>{label}{required ? ' *' : ''}<input name={name} type={type} defaultValue={value} required={required} aria-invalid={Boolean(fieldErrors[name])} aria-describedby={fieldErrors[name] ? `${name}-error` : undefined} />{fieldErrors[name] && <span id={`${name}-error`} className="field-error">{fieldErrors[name]}</span>}</label>;
  async function geocode(form: HTMLFormElement) {
    const data = new FormData(form);
    setGeocoding(true); setMessage('');
    try {
      const response = await fetch('/api/admin/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: data.get('address'), venue: data.get('venue'), city: data.get('city'), state: data.get('state') }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível localizar o endereço.');
      if (!result.results?.length) { setMessage('Não encontramos as coordenadas automaticamente. Você pode salvar o evento e revisar isso depois.'); return; }
      const match = result.results.find((item: { displayName: string }) => String(item.displayName).toLowerCase().includes(String(data.get('city') || '').toLowerCase())) || result.results[0];
      (form.elements.namedItem('latitude') as HTMLInputElement).value = String(match.latitude);
      (form.elements.namedItem('longitude') as HTMLInputElement).value = String(match.longitude);
      setMessage(result.results.length > 1 ? 'Coordenadas encontradas; confira o local antes de salvar.' : 'Coordenadas preenchidas.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível localizar o endereço.'); }
    finally { setGeocoding(false); }
  }
  return (
    <>
      <form className="admin-form" onSubmit={submit}>
        {input('name', 'Nome da corrida', event?.name, 'text', true)}
        {input('slug', 'Slug público (ex.: corrida-da-serra-2026)', event?.slug, 'text', true)}
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
        {input(
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
        {input('state', 'UF', event?.state, 'text', true)}
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
        <button type="button" className="text-button" disabled={geocoding} onClick={(e) => void geocode((e.currentTarget.form as HTMLFormElement))}>
          {geocoding ? 'Buscando…' : 'Buscar coordenadas'}
        </button>
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
        {input('registration_url', 'URL de inscrição (HTTPS)', event?.registration_url, 'url')}
        {input('official_url', 'Site oficial (HTTPS)', event?.official_url, 'url')}
        {input('regulation_url', 'Regulamento (HTTPS)', event?.regulation_url, 'url')}
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
