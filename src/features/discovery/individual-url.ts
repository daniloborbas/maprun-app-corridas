export const BRAZILIAN_STATES = new Set(['ac','al','ap','am','ba','ce','df','es','go','ma','mt','ms','mg','pa','pb','pr','pe','pi','rj','rn','rs','ro','rr','sc','sp','se','to']);

export function isCorrida1IndividualPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 5 || segments[0] !== 'corridas') return false;
  const [, state, city, year, ...slug] = segments;
  return BRAZILIAN_STATES.has(state.toLowerCase()) && /^[0-9]{4}$/.test(year) && Boolean(city) && slug.length >= 1 && slug.some((part) => part.length > 0);
}
