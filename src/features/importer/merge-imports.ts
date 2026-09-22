import type { ImportedEventDraft } from './url-import';

export type ImportConflict = { field: 'startDate' | 'city' | 'state' | 'registrationUrl' | 'distances'; primary: string; secondary: string };
export type MergedImport = { draft: ImportedEventDraft; sources: string[]; conflicts: ImportConflict[] };

/** Combines sources without allowing an empty or conflicting secondary value to overwrite data. */
export function mergeEventImports(primary: ImportedEventDraft, secondary: ImportedEventDraft): MergedImport {
  const conflicts: ImportConflict[] = [];
  const draft = { ...primary };
  const choose = (field: 'startDate' | 'city' | 'state' | 'registrationUrl') => {
    const a = primary[field] || ''; const b = secondary[field] || '';
    if (a && b && a !== b) conflicts.push({ field, primary: a, secondary: b });
    else if (!a && b) draft[field] = b;
  };
  choose('startDate'); choose('city'); choose('state'); choose('registrationUrl');
  if (!draft.name && secondary.name) draft.name = secondary.name;
  if (!draft.description && secondary.description) draft.description = secondary.description;
  if (!draft.shortDescription && secondary.shortDescription) draft.shortDescription = secondary.shortDescription;
  if (!draft.venue && secondary.venue) draft.venue = secondary.venue;
  if (!draft.address && secondary.address) draft.address = secondary.address;
  if (!draft.organizerName && secondary.organizerName) draft.organizerName = secondary.organizerName;
  if (!draft.coverImageUrl && secondary.coverImageUrl) draft.coverImageUrl = secondary.coverImageUrl;
  if (!draft.priceFrom && secondary.priceFrom) draft.priceFrom = secondary.priceFrom;
  if ((!draft.distances.length) && secondary.distances.length) draft.distances = secondary.distances;
  else if (draft.distances.length && secondary.distances.length && JSON.stringify(draft.distances) !== JSON.stringify(secondary.distances)) conflicts.push({ field: 'distances', primary: String(draft.distances.length), secondary: String(secondary.distances.length) });
  draft.fieldsFound = [...new Set([...draft.fieldsFound, ...secondary.fieldsFound])];
  return { draft, sources: [...new Set([primary.sourceUrl, secondary.sourceUrl])], conflicts };
}
