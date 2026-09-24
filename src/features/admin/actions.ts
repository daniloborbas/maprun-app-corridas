'use server';
import { requireAdmin } from '@/lib/supabase/server';
import { eventSchema } from '@/features/events/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { OpenAIFeedImageGenerator } from '@/features/events/feed-image-generator';
export async function saveAdminEvent(input: unknown, attemptId?: string): Promise<{ id?: string; error?: string; diagnosticId?: string }> {
  const diagnosticId = attemptId && /^[a-z0-9]{8}$/i.test(attemptId) ? attemptId : crypto.randomUUID().slice(0, 8);
  console.error('[MapRun event-save:start]', { diagnosticId });
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    const validationMessage = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ');
    console.error('[MapRun event-save:validation-failed]', { diagnosticId, issues: validationMessage });
    return { error: validationMessage, diagnosticId };
  }
  console.error('[MapRun event-save:validated]', { diagnosticId });
  try {
    const { client } = await requireAdmin();
    console.error('[MapRun event-save:admin-ok]', { diagnosticId });
    const { data: duplicates } = await client
      .from('events')
      .select('id,name')
      .eq('city', parsed.data.city)
      .eq('start_date', parsed.data.start_date)
      .ilike('name', parsed.data.name)
      .is('deleted_at', null);
    console.error('[MapRun event-save:duplicate-check-ok]', { diagnosticId });
    if (duplicates?.some((e) => e.id !== parsed.data.id))
      return {
        error: 'Já existe uma corrida com esse nome, cidade e horário. Edite o cadastro existente.',
      };
    console.error('[MapRun event-save:rpc-start]', { diagnosticId });
    const { data, error } = await client.rpc('save_event', { payload: parsed.data });
    console.error('[MapRun event-save:rpc-end]', { diagnosticId, ok: !error });
    if (error) {
      console.error('[MapRun save_event]', {
        diagnosticId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      const detail = `${error.message || ''} ${error.details || ''}`.toLowerCase();
      return { error: error.code === '23505' || detail.includes('slug') ? 'Este slug já está em uso.' : error.code === '23514' && detail.includes('latitude') ? 'Latitude e longitude devem ser preenchidas juntas.' : 'Não foi possível salvar o evento.', diagnosticId };
    }
    revalidatePath('/', 'layout');
    return { id: String(data) };
  } catch (error) {
    if (error instanceof Error && (error.message === 'Autenticação necessária.' || error.message.includes('Acesso restrito'))) return { error: 'Sua sessão não possui acesso administrativo. Entre novamente.' };
    console.error('[MapRun saveAdminEvent exception]', { diagnosticId, name: error instanceof Error ? error.name : 'Unknown', message: error instanceof Error ? error.message : String(error) });
    return { error: 'Não foi possível salvar o evento.', diagnosticId };
  }
}
export async function deleteAdminEvent(id: string) {
  if (!z.uuid().safeParse(id).success) return { error: 'Evento inválido.' };
  try {
    const { client } = await requireAdmin();
    const { data: event } = await client.from('events').select('slug').eq('id', id).maybeSingle();
    const { error } = await client
      .from('events')
      .update({ deleted_at: new Date().toISOString(), status: 'archived' })
      .eq('id', id);
    if (error) return { error: 'Não foi possível arquivar.' };
    revalidatePath('/', 'layout');
    if (event?.slug) revalidatePath(`/corrida/${event.slug}`);
    return { success: true };
  } catch {
    return { error: 'Acesso negado.' };
  }
}

export async function regenerateAdminFeedImage(id: string) {
  if (!z.uuid().safeParse(id).success) return { error: 'Evento inválido.' };
  try {
    const { client } = await requireAdmin();
    const { data: event, error: readError } = await client.from('events').select('id,slug,name,city,state,venue,event_category,description,feed_image_url,event_distances(label)').eq('id', id).maybeSingle();
    if (readError || !event) return { error: 'Evento não encontrado.' };
    const generated = await new OpenAIFeedImageGenerator().generate(event);
    const path = `${id}/feed-${Date.now()}.webp`;
    const upload = await client.storage.from('event-feed').upload(path, new Blob([new Uint8Array(generated.bytes)], { type: generated.mimeType }), { contentType: generated.mimeType, cacheControl: '31536000', upsert: true });
    if (upload.error) throw new Error('storage_upload_failed');
    const { data: publicData } = client.storage.from('event-feed').getPublicUrl(path);
    const feedImageUrl = publicData.publicUrl;
    const { error } = await client.from('events').update({ feed_image_url: feedImageUrl }).eq('id', id);
    if (error) return { error: 'Não foi possível gerar a imagem.' };
    revalidatePath('/', 'layout');
    return { success: true, feedImageUrl };
  } catch (error) { console.error('[MapRun feed-image]', { type: error instanceof Error ? error.message : 'unknown' }); return { error: 'Não foi possível gerar a imagem agora.' }; }
}

export async function generatePublishedFeedImage(id: string) {
  return regenerateAdminFeedImage(id);
}
