/**
 * Pure extraction of a P625 (coordinate location) claim from a Wikidata
 * entity JSON payload (the shape returned by both the `wbgetentities` action
 * API and the Special:EntityData REST endpoint, for a single entity).
 *
 * Kept total and defensive: never throws, returns `undefined` for anything
 * missing or shaped unexpectedly (no claim, novalue/somevalue snak, malformed
 * nesting) so the import script can skip an entity rather than crash on it.
 */

/** The minimal slice of a Wikidata entity JSON payload this module reads. */
export interface WikidataEntity {
  claims?: {
    P625?: Array<{
      mainsnak?: {
        datavalue?: {
          value?: {
            latitude?: unknown;
            longitude?: unknown;
          };
        };
      };
    }>;
  };
}

export function extractCoordinate(entity: WikidataEntity): { lat: number; lon: number } | undefined {
  const value = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  if (value === undefined || value === null) return undefined;

  const { latitude, longitude } = value;
  if (typeof latitude !== "number" || typeof longitude !== "number") return undefined;

  return { lat: latitude, lon: longitude };
}
