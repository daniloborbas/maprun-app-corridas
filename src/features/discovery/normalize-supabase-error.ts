export type NormalizedSupabaseError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  statusCode?: number;
};

export function normalizeSupabaseError(error: unknown): NormalizedSupabaseError {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const message = error instanceof Error ? error.message : value && typeof value.message === 'string' ? value.message : 'Erro desconhecido de persistência.';
  return {
    message,
    ...(value && typeof value.code === 'string' ? { code: value.code } : {}),
    ...(value && typeof value.details === 'string' ? { details: value.details } : {}),
    ...(value && typeof value.hint === 'string' ? { hint: value.hint } : {}),
    ...(value && typeof value.status === 'number' ? { status: value.status } : {}),
    ...(value && typeof value.statusCode === 'number' ? { statusCode: value.statusCode } : {}),
  };
}
