'use server';
import { z } from 'zod';
import { db } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
const schema = z.object({
  name: z.string().min(2).max(100),
  city: z.string().max(100),
  state: z.string().regex(/^$|^[A-Z]{2}$/),
  favorite_distances: z.array(z.number().min(0).max(1000)).max(20),
  preferred_categories: z.array(z.enum(['rua', 'trail', 'night', 'kids'])).max(4),
  alerts_enabled: z.boolean().optional(), nearby_events_enabled: z.boolean().optional(), city_events_enabled: z.boolean().optional(), saved_event_reminders_enabled: z.boolean().optional(), preferred_radius_km: z.union([z.literal(25),z.literal(50),z.literal(100),z.literal(200)]).optional(),
});
export async function saveProfile(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: 'Revise os campos do perfil.' };
  const client = await db();
  if (!client) return { error: 'Perfil disponível após conectar o Supabase.' };
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: 'Sua sessão expirou. Entre novamente.' };
  const { error } = await client
    .from('profiles')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) return { error: 'Não foi possível salvar o perfil.' };
  revalidatePath('/perfil');
  return { success: true };
}
