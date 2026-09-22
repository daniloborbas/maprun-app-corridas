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
    if (error)
      return {
        error:
          error.code === '23505'
            ? 'Este slug já está em uso.'
            : 'Não foi possível salvar. Confira os dados e a conexão.',
      };
    revalidatePath('/', 'layout');
    return { id: String(data) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Acesso negado.' };
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
