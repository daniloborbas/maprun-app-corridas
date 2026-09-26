export type BatchDiagnostic = Record<string, unknown>;

export function parseBatchResponseBody(status: number, contentType: string | null, text: string): BatchDiagnostic {
  const trimmed = text.trim();
  if (trimmed) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { httpStatus: status, ...(parsed as BatchDiagnostic) };
      }
    } catch {
      // Fall through to the safe text representation below.
    }
  }

  return {
    httpStatus: status,
    contentType: contentType || undefined,
    message: trimmed.slice(0, 240) || `HTTP ${status}`,
  };
}

export function formatBatchDiagnostic(diagnostic: BatchDiagnostic): string {
  return JSON.stringify(diagnostic, null, 2);
}
