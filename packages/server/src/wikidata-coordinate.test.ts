import { describe, expect, it } from "vitest";
import { extractCoordinate, type WikidataEntity } from "./wikidata-coordinate.js";

describe("extractCoordinate", () => {
  it("extracts lat/lon from a well-formed P625 claim", () => {
    const entity: WikidataEntity = {
      claims: {
        P625: [
          {
            mainsnak: {
              datavalue: {
                value: { latitude: 35.6895, longitude: 139.6917 },
              },
            },
          },
        ],
      },
    };

    expect(extractCoordinate(entity)).toEqual({ lat: 35.6895, lon: 139.6917 });
  });

  it("returns undefined when there is no P625 claim", () => {
    expect(extractCoordinate({ claims: {} })).toBeUndefined();
    expect(extractCoordinate({})).toBeUndefined();
  });

  it("returns undefined for a novalue/somevalue snak (no datavalue)", () => {
    const entity: WikidataEntity = {
      claims: {
        P625: [{ mainsnak: {} }],
      },
    };

    expect(extractCoordinate(entity)).toBeUndefined();
  });

  it("returns undefined and never throws on malformed or missing nested fields", () => {
    expect(extractCoordinate({ claims: { P625: [] } })).toBeUndefined();
    expect(extractCoordinate({ claims: { P625: [{}] } })).toBeUndefined();
    expect(
      extractCoordinate({
        claims: { P625: [{ mainsnak: { datavalue: {} } }] },
      }),
    ).toBeUndefined();
    expect(
      extractCoordinate({
        claims: { P625: [{ mainsnak: { datavalue: { value: {} } } }] },
      }),
    ).toBeUndefined();
    expect(
      extractCoordinate({
        claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: "not-a-number", longitude: 1 } } } }] },
      }),
    ).toBeUndefined();
  });
});
