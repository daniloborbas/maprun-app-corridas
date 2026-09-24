'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Plus, Trash2 } from 'lucide-react';
import { saveAdminEvent, deleteAdminEvent, regenerateAdminFeedImage } from './actions';
import type { RaceEvent, EventDistance } from '@/features/events/types';
import { generateEventEditorialContent } from '@/features/events/editorial';
import { classifyRegistrationUrl, resolveRegistrationDestination } from '@/features/events/registration';
import { EVENT_FALLBACK_IMAGES } from '@/features/events/fallback-images';
import { buildGeneratedFeedImageUrl } from '@/features/events/images';
export function slugify(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
const toLocal = (v?: string | null) => {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00`;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?(?:Z|\+00:00)$/.test(v)) return `${v.slice(0, 10)}T00:00`;
  return new Date(new Date(v).getTime() - 3 * 3600000).toISOString().slice(0, 16);
};
export function AdminEventForm({ event, forceDraft = false, sourceMethod = 'manual', disableSave = false }: { event?: RaceEvent; forceDraft?: boolean | 'finished'; sourceMethod?: string; disableSave?: boolean }) {
  const router = useRouter();
  const [distances, setDistances] = useState<EventDistance[]>(
    event?.event_distances?.map((distance) => ({
      ...distance,
      start_time: distance.start_time ?? '',
    })) || [{ label: '5 km', distance_km: 5, category: 'rua' }],
  );
  async function regenerateFeedImage() {
    if (!event?.id) return;
    setBusy(true);
    const result = await regenerateAdminFeedImage(event.id);
    setMessage(result.error || 'Imagem do feed regenerada.');
    setBusy(false);
    if (!result.error) router.refresh();
  }
  const [existingSources] = useState(() => event?.event_sources?.map((source) => ({ source_name: source.source_name, source_url: source.source_url, source_method: source.source_method || source.import_method || 'manual' })) || []);
  const [officialUrl, setOfficialUrl] = useState(event?.official_url || '');
  const [registrationUrl, setRegistrationUrl] = useState(event?.registration_url || '');
  const [fallbackImageKey, setFallbackImageKey] = useState(event?.fallback_image_key || null);
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
    if (Object.keys(errors).length || disableSave) { setMessage(disableSave ? 'Resolva as informações divergentes antes de salvar.' : 'Revise os campos destacados abaixo.'); setBusy(false); const first = e.currentTarget.elements.namedItem(Object.keys(errors)[0]) as HTMLElement | null; first?.focus(); first?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    let result: Awaited<ReturnType<typeof saveAdminEvent>>;
    const attemptId = crypto.randomUUID().slice(0, 8);
    const nextStatus = forceDraft === 'finished' ? 'finished' : forceDraft ? 'draft' : text('status');
    try {
      result = await saveAdminEvent({
      id: event?.id && event.id.length > 10 ? event.id : undefined,
      name: text('name'),
      slug: text('slug') || slugify(text('name')),
      short_description: text('short_description'),
      description: text('description'),
      description_source: text('description_source') || 'unknown',
      feed_image_url: nextStatus === 'published' && !event?.feed_image_url ? buildGeneratedFeedImageUrl({ slug: text('slug') || slugify(text('name')), name: text('name'), city: text('city'), state: text('state').toUpperCase(), category: text('event_category'), distances: distances.map((d) => d.label), startDate: text('start_date'), price: num('price_from') }) : (event?.feed_image_url || null),
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
      fallback_image_key: fallbackImageKey,
      has_usable_official_image: data.has('has_usable_official_image'),
      short_tagline: text('short_tagline'),
      status: nextStatus,
      organizer_verified: data.has('organizer_verified'),
      event_distances: distances.map((d, i) => ({ ...d, order_index: i })),
      source_name: sourceMethod === 'url' ? 'Importação por URL' : text('source_name'),
      source_url: text('source_url'),
      source_method: sourceMethod,
      event_sources: existingSources.length ? existingSources : [{ source_name: sourceMethod === 'url' ? 'Importação por URL' : text('source_name'), source_url: text('source_url'), source_method: sourceMethod }],
      }, attemptId);
    } catch (error) {
      console.error('[MapRun event-save client]', { attemptId, name: error instanceof Error ? error.name : 'Unknown', message: error instanceof Error ? error.message : String(error) });
      setMessage(`Falha ao comunicar com o servidor. Código de diagnóstico: ${attemptId}`);
      return;
    } finally {
      setBusy(false);
    }
    if (result.error) { const next = { ...fieldErrors }; if (result.error.includes('slug')) next.slug = result.error; else if (result.error.includes('coordenadas')) { next.latitude = result.error; next.longitude = result.error; } setFieldErrors(next); const safe = Boolean(result.diagnosticId) || result.error.startsWith('Já existe') || result.error.startsWith('Este slug') || result.error.startsWith('Sua sessão') || result.error.startsWith('A categoria') || result.error.startsWith('Não foi possível salvar uma'); setMessage(safe ? (result.diagnosticId ? `${result.error} Código de diagnóstico: ${result.diagnosticId}` : result.error) : 'Não foi possível salvar agora. Tente novamente.'); }
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
      if (!result.results?.length) { setMessage('Não foi possível localizar este endereço.'); return; }
      const match = result.results.find((item: { displayName: string }) => String(item.displayName).toLowerCase().includes(String(data.get('city') || '').toLowerCase())) || result.results[0];
      (form.elements.namedItem('latitude') as HTMLInputElement).value = String(match.latitude);
      (form.elements.namedItem('longitude') as HTMLInputElement).value = String(match.longitude);
      setMessage(result.approximate ? 'Coordenadas encontradas. Localização aproximada pela cidade.' : 'Coordenadas encontradas.');
      setMessage(result.results.length > 1 ? 'Coordenadas encontradas; confira o local antes de salvar.' : 'Coordenadas preenchidas.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível localizar o endereço.'); }
    finally { setGeocoding(false); }
  }
  function generateDescriptions(form: HTMLFormElement) {
    const data = new FormData(form);
    const generated = generateEventEditorialContent({
      name: String(data.get('name') || ''),
      startDate: String(data.get('start_date') || '') ? `${String(data.get('start_date'))}:00-03:00` : null,
      startTime: String(data.get('start_date') || '').slice(11, 16),
      city: String(data.get('city') || ''),
      state: String(data.get('state') || ''),
      venue: String(data.get('venue') || ''),
      organizerName: String(data.get('organizer_name') || ''),
      category: String(data.get('event_category') || ''),
      priceFrom: String(data.get('price_from') || '') ? Number(data.get('price_from')) : null,
      registrationUrl: String(data.get('registration_url') || ''),
      distances: distances.map((distance) => ({ label: distance.label, distance_km: distance.distance_km })),
    });
    const short = form.elements.namedItem('short_description') as HTMLInputElement | null;
    const full = form.elements.namedItem('description') as HTMLTextAreaElement | null;
    if (short) short.value = generated.shortDescription;
    if (full) full.value = generated.description;
    const source = form.elements.namedItem('description_source') as HTMLInputElement | null;
    if (source) source.value = 'editorial_generated';
    setMessage('Descrições geradas para revisão.');
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
        <label className={fieldErrors.registration_url ? 'has-error' : ''}>
          URL direta de inscrição (HTTPS)
          <input name="registration_url" type="url" value={registrationUrl} onChange={(e) => setRegistrationUrl(e.target.value)} aria-invalid={Boolean(fieldErrors.registration_url)} />
          <small>Link direto para a inscrição desta prova. Evite a página inicial da plataforma.</small>
          {registrationUrl && classifyRegistrationUrl(registrationUrl) === 'generic' ? <span className="field-warning">Este link parece genérico. Verifique antes de publicar.</span> : null}
          {registrationUrl && <a href={registrationUrl} target="_blank" rel="noopener noreferrer" className="text-button">Abrir link ↗</a>}
        </label>
        <label className={fieldErrors.official_url ? 'has-error' : ''}>
          Página oficial da corrida
          <input name="official_url" type="url" value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} aria-invalid={Boolean(fieldErrors.official_url)} />
          <small>Página específica desta prova no site do organizador ou portal.</small>
          {officialUrl && <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="text-button">Abrir link ↗</a>}
        </label>
        {officialUrl && classifyRegistrationUrl(registrationUrl) !== 'specific' && classifyRegistrationUrl(officialUrl) !== 'generic' ? <button type="button" className="text-button" onClick={() => setRegistrationUrl(officialUrl)}>Usar página oficial como inscrição</button> : null}
        <div className="wide registration-preview">
          <small>Destino atual do botão “Inscrever-se”</small>
          <strong>{resolveRegistrationDestination({ registration_url: registrationUrl, official_url: officialUrl }) || 'Sem destino válido'}</strong>
          {resolveRegistrationDestination({ registration_url: registrationUrl, official_url: officialUrl }) && <a href={resolveRegistrationDestination({ registration_url: registrationUrl, official_url: officialUrl }) || undefined} target="_blank" rel="noopener noreferrer" className="text-button">Testar botão Inscrever-se ↗</a>}
        </div>
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
        <div className="wide fallback-library">
          <strong>Biblioteca de capas fallback</strong>
          <small>Escolha uma capa manual ou volte para a seleção automática contextual.</small>
          <button type="button" className="text-button" onClick={() => setFallbackImageKey(null)}>Usar seleção automática</button>
          {fallbackImageKey ? (() => {
            const selected = EVENT_FALLBACK_IMAGES.find((image) => image.key === fallbackImageKey);
            return selected ? <Image className="fallback-preview" src={selected.src} alt="Prévia da capa fallback selecionada" width={360} height={225} sizes="(max-width: 760px) 100vw, 360px" /> : null;
          })() : null}
          <div className="fallback-grid">
            {EVENT_FALLBACK_IMAGES.map((image) => (
              <button type="button" key={image.key} className={fallbackImageKey === image.key ? 'fallback-choice selected' : 'fallback-choice'} aria-label={`Usar capa ${image.key}`} aria-pressed={fallbackImageKey === image.key} onClick={() => setFallbackImageKey(image.key)}>
                <Image src={image.src} alt={`Capa ${image.key}`} width={240} height={150} sizes="(max-width: 760px) 50vw, 25vw" />
              </button>
            ))}
          </div>
        </div>
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
          <small>Exibida nos cards e no feed.</small>
        </label>
        <label className="wide">
          Descrição completa
          <small className="text-muted">Origem: {{ manual: 'Manual', editorial_generated: 'Gerada', imported: 'Importada', unknown: 'Desconhecida' }[event?.description_source || 'unknown']}</small>
          <input type="hidden" name="description_source" defaultValue={event?.description_source || 'unknown'} />
          <textarea name="description" defaultValue={event?.description} onChange={(e) => { const source = e.currentTarget.form?.elements.namedItem('description_source') as HTMLInputElement | null; if (source && source.value !== 'editorial_generated') source.value = 'manual'; }} />
          <small>Exibida na página completa da corrida.</small>
          {event?.id && <button type="button" className="text-button" onClick={regenerateFeedImage} disabled={busy}>Regenerar imagem do feed</button>}
        </label>
        <div className="wide">
          <button type="button" className="text-button" onClick={(e) => generateDescriptions(e.currentTarget.form as HTMLFormElement)}>
            Gerar descrições
          </button>
          <small>Preenche os textos com os fatos atuais para você revisar antes de salvar.</small>
        </div>
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
          <button className="button" disabled={busy || disableSave}>
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

