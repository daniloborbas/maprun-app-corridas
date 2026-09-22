'use server';
import { requireAdmin } from '@/lib/supabase/server';
import { eventSchema } from '@/features/events/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
export async function saveAdminEvent(input: unknown): Promise<{ id?: string; error?: string }> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '),
    };
  try {
    const { client } = await requireAdmin();
    const { data: duplicates } = await client
      .from('events')
      .select('id,name')
      .eq('city', parsed.data.city)
      .eq('start_date', parsed.data.start_date)
      .ilike('name', parsed.data.name)
      .is('deleted_at', null);
    if (duplicates?.some((e) => e.id !== parsed.data.id))
      return {
        error: 'Já existe uma corrida com esse nome, cidade e horário. Edite o cadastro existente.',
      };
    const { data, error } = await client.rpc('save_event', { payload: parsed.data });
    if (error) {
      const detail = `${error.message || ''} ${error.details || ''}`.toLowerCase();
      return { error: error.code === '23505' || detail.includes('slug') ? 'Este slug já está em uso.' : error.code === '23514' && detail.includes('latitude') ? 'Latitude e longitude devem ser preenchidas juntas.' : 'Não foi possível salvar o evento. Verifique os campos e tente novamente.' };
    }
    revalidatePath('/', 'layout');
    return { id: String(data) };
  } catch (error) {
    if (error instanceof Error && (error.message === 'Autenticação necessária.' || error.message.includes('Acesso restrito'))) return { error: 'Sua sessão não possui acesso administrativo. Entre novamente.' };
    console.error('save_event failed', error instanceof Error ? { message: error.message } : { error: 'unknown' });
    return { error: 'Não foi possível salvar o evento. Tente novamente.' };
  }
}
export async function deleteAdminEvent(id: string) {
  if (!z.uuid().safeParse(id).success) return { error: 'Evento inválido.' };
  try {
    const { client } = await requireAdmin();
    const { error } = await client
      .from('events')
      .update({ deleted_at: new Date().toISOString(), status: 'archived' })
      .eq('id', id);
    if (error) return { error: 'Não foi possível arquivar.' };
    revalidatePath('/', 'layout');
    return { success: true };
  } catch {
    return { error: 'Acesso negado.' };
  }
}
