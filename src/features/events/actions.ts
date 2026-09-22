'use server';
import { db } from '@/lib/supabase/server';
import { z } from 'zod';
export async function setEventInteraction(
  eventId: string,
  kind: 'favorite' | 'going',
  active: boolean,
) {
  if (
    !z.uuid().safeParse(eventId).success ||
    !['favorite', 'going'].includes(kind) ||
    typeof active !== 'boolean'
  )
    return { error: 'Ação inválida.' };
  const client = await db();
  if (!client) return { error: 'Conecte o Supabase para salvar eventos na sua conta.' };
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: 'Entre novamente para continuar.', needsLogin: true };
  const table = kind === 'favorite' ? 'favorites' : 'event_attendance';
  const { error } = active
    ? await client
        .from(table)
        .upsert({ user_id: user.id, event_id: eventId }, { onConflict: 'user_id,event_id' })
    : await client.from(table).delete().eq('user_id', user.id).eq('event_id', eventId);
  return error ? { error: 'Não foi possível atualizar. Tente novamente.' } : { success: true };
}
export async function getInteractionCounts(eventId: string) {
  if (!z.uuid().safeParse(eventId).success) return 0;
  const client = await db();
  if (!client) return 0;
  const { data } = await client.rpc('attendance_count', { race_id: eventId });
  return Number(data || 0);
}
