import { z } from 'zod';
export const analyticsSchema = z.object({
  kind: z.enum([
    'page_view',
    'race_impression',
    'race_view',
    'race_save',
    'race_unsave',
    'race_share',
    'going_add',
    'going_remove',
    'registration_click',
    'search',
    'filter_used',
    'location_permission_granted',
    'location_permission_denied',
    'manual_location_selected',
  ]),
  eventId: z.uuid().nullable().optional(),
  sessionId: z.uuid(),
  source: z.string().max(200),
  properties: z
    .object({
      utm_source: z.string().max(150).optional(),
      utm_medium: z.string().max(150).optional(),
      utm_campaign: z.string().max(150).optional(),
      visitor_id: z.string().max(100).optional(),
      referrer: z.string().max(500).optional(),
      ref: z.string().max(150).optional(),
      category: z.string().max(40).optional(),
      results: z.number().int().min(0).optional(),
    })
    .optional(),
});
export type AnalyticsKind = z.infer<typeof analyticsSchema>['kind'];
