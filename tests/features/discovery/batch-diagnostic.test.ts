import { describe, expect, it } from 'vitest';
import { parseBatchResponseBody } from '../../../src/features/discovery/batch-diagnostic';

describe('parseBatchResponseBody', () => {
  it('preserves structured HTTP 409 diagnostics', () => {
    const result = parseBatchResponseBody(409, 'application/json', JSON.stringify({ code: 'chunk_cardinality_mismatch', expected: 2, returned: 0, selectionDiagnostics: { rowsFound: 2 } }));
    expect(result).toMatchObject({ httpStatus: 409, code: 'chunk_cardinality_mismatch', expected: 2, returned: 0, selectionDiagnostics: { rowsFound: 2 } });
  });

  it('keeps partial JSON fields', () => {
    expect(parseBatchResponseBody(409, 'application/json', '{"code":"partial"}')).toEqual({ httpStatus: 409, code: 'partial' });
  });

  it('uses safe text for non-JSON responses', () => {
    expect(parseBatchResponseBody(502, 'text/plain', '<html>bad gateway</html>')).toMatchObject({ httpStatus: 502, message: '<html>bad gateway</html>', contentType: 'text/plain' });
  });

  it('keeps normal 200 payloads unchanged apart from status', () => {
    expect(parseBatchResponseBody(200, 'application/json', '{"batch":{"processed_count":2}}')).toEqual({ httpStatus: 200, batch: { processed_count: 2 } });
  });
});

