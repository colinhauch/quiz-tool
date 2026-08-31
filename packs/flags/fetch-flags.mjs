// Re-runnable author-time fetch for the `flags` pack (spec #180, ticket #182).
//
// Drives off core-geo's OWN country entities — the pack asserts `flag`
// statements about core-geo countries and owns no entities itself, so the set
// of flags is exactly the set of `type: "country"` entities in
// ../core-geo/entities.jsonl. That guarantees every statement resolves to a
// real core-geo entity (a hard validation rule) without a second curated list
// to keep in sync. core-geo currently holds the 193 UN members; the two UN
// observers (Vatican, Palestine) are not core-geo entities, so they are out of
// scope here — adding them is a core-geo entity change, not a flags change.
//
// For each country it resolves, in one WDQS pass:
//   - ISO 3166-1 alpha-2 (Wikidata P297) — the vendored file key and served src.
//   - the flag image (Wikidata P41) — a Commons Special:FilePath URL.
// then downloads each flag SVG to assets/<alpha2>.svg and queries the Commons
// API for each file's license short name (provenance). Emits, sorted by
// alpha-2 for byte-stable output:
//   - statements.jsonl : one `flag` statement per country (image literal).
//   - assets/<alpha2>.svg : the vendored source-of-truth SVGs (wiped + rebuilt).
//   - provenance.json : per-file { qid, country, alpha2, sourceUrl, license }.
//
// Idempotent: same core-geo + same Wikidata in → same files out. Not part of
// the build or test suite — scaffolding, kept re-runnable because re-publishing
// is a deliberate, reviewed act (a moved flag or license alters these files).
//
// Usage:  node fetch-flags.mjs   (from this directory; needs network)

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const UA = "geo-quiz-tool/0.1 flags publish (colin.hauch@gmail.com)";
const WD_BATCH = 50; // wbgetentities caps ids per request at 50.
const COMMONS_BATCH = 40; // MediaWiki caps titles per query at 50; 40 leaves headroom.

// Claims (P297/P41) are read via the MediaWiki wbgetentities API, not WDQS: a
// large WDQS `VALUES` batch silently dropped Kingdom of Denmark (Q756617) from
// its P297 result, a query-optimizer quirk that returned it fine on a 2-item
// query. wbgetentities reads each entity's stored claims directly, so coverage
// does not depend on batch size.

/** Special:FilePath URL that resolves to a Commons file's bytes. */
function filePathUrl(filename) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}

/**
 * Pick one flag deterministically when a country carries several P41 values
 * (e.g. Denmark's civil vs. state flag): prefer names with no parenthetical
 * qualifier — "(state)", "(civil)" — then the shortest, then lexicographic.
 * That lands on the plain national flag and is stable across runs.
 */
function pickFlag(filenames) {
  return [...filenames].sort((a, b) => {
    const qa = a.includes("(") ? 1 : 0;
    const qb = b.includes("(") ? 1 : 0;
    return qa - qb || a.length - b.length || a.localeCompare(b);
  })[0];
}

/** Read core-geo's country entities into ordered { qid, label } rows. */
function readCountries() {
  const text = readFileSync(new URL("../core-geo/entities.jsonl", import.meta.url), "utf8");
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .filter((e) => e.types.includes("country"))
    .map((e) => ({ id: e.id, label: e.labels.en }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Best-rank string values of a property from a wbgetentities claims block. */
function claimValues(claims, prop) {
  const all = (claims?.[prop] ?? []).filter((c) => c.mainsnak?.snaktype === "value");
  const preferred = all.filter((c) => c.rank === "preferred");
  return (preferred.length ? preferred : all).map((c) => c.mainsnak.datavalue.value);
}

/** wbgetentities for one batch of ids → { id → claims }, with a couple retries. */
async function getClaims(ids) {
  const params = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    ids: ids.join("|"),
    props: "claims",
    maxlag: "5",
  });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${WIKIDATA_API}?${params}`, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.info ?? json.error.code);
      const out = {};
      for (const [id, entity] of Object.entries(json.entities ?? {})) out[id] = entity.claims;
      return out;
    } catch (err) {
      if (attempt >= 4) throw err;
      await sleep(1000 * attempt);
    }
  }
}

/**
 * P297 (alpha-2) + P41 (flag filenames) per country, read straight from each
 * entity's stored claims via wbgetentities. Honors preferred rank so a country
 * that flags one flag as preferred yields just that one.
 *
 * A batch occasionally comes back with some requested ids absent — a transient
 * API hiccup that drops a different slice each run — so this re-requests only
 * the still-unresolved ids across several rounds before giving up. Determinism
 * is unaffected: what each id resolves to never changes, only whether a given
 * round returned it.
 */
async function fetchClaims(ids) {
  const iso = new Map(); // qid → alpha-2 (lowercase)
  const flags = new Map(); // qid → string[] of Commons filenames
  let pending = ids;
  for (let round = 1; pending.length && round <= 5; round++) {
    if (round > 1) {
      process.stderr.write(`retrying ${pending.length} unresolved (round ${round})\n`);
      await sleep(1500);
    }
    for (let i = 0; i < pending.length; i += WD_BATCH) {
      const batch = pending.slice(i, i + WD_BATCH);
      const claims = await getClaims(batch);
      for (const [id, c] of Object.entries(claims)) {
        const alpha2 = claimValues(c, "P297")[0];
        if (alpha2) iso.set(id, alpha2.toLowerCase());
        const flagFiles = claimValues(c, "P41");
        if (flagFiles.length) flags.set(id, flagFiles);
      }
    }
    pending = ids.filter((id) => !iso.has(id) || !flags.has(id));
    process.stderr.write(`resolved ${ids.length - pending.length}/${ids.length}\n`);
  }
  return { iso, flags };
}

/**
 * Fetch one flag SVG, serialized behind a small delay and retried with backoff
 * on 429/503 (honoring Retry-After) — Commons rate-limits bursts. Returns the
 * SVG text; throws only after retries are exhausted or on a non-retryable error.
 */
async function downloadFlag(r) {
  for (let attempt = 1; ; attempt++) {
    await sleep(200);
    const res = await fetch(filePathUrl(r.filename), { headers: { "User-Agent": UA } });
    if (res.ok) {
      const svg = await res.text();
      process.stderr.write(`downloaded ${r.alpha2}.svg (${r.label})\n`);
      return svg;
    }
    if ((res.status === 429 || res.status === 503) && attempt < 6) {
      const retryAfter = Number(res.headers.get("retry-after")) || attempt * 2;
      process.stderr.write(`  ${res.status} for ${r.alpha2}, waiting ${retryAfter}s\n`);
      await sleep(retryAfter * 1000);
      continue;
    }
    throw new Error(`download ${res.status} for ${r.label} (${r.filename})`);
  }
}

/** License short name per Commons file (extmetadata.LicenseShortName). */
async function fetchLicenses(filenames) {
  const licenses = new Map(); // filename → license short name
  for (let i = 0; i < filenames.length; i += COMMONS_BATCH) {
    const batch = filenames.slice(i, i + COMMONS_BATCH);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "imageinfo",
      iiprop: "extmetadata",
      titles: batch.map((f) => `File:${f}`).join("|"),
    });
    const res = await fetch(`${COMMONS_API}?${params}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Commons API ${res.status}`);
    const pages = (await res.json()).query?.pages ?? {};
    for (const page of Object.values(pages)) {
      const title = page.title?.replace(/^File:/, "");
      const short = page.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value;
      if (title) licenses.set(title, short ?? "unknown");
    }
  }
  return licenses;
}

async function main() {
  const countries = readCountries();
  process.stderr.write(`resolving ${countries.length} core-geo countries\n`);

  // Pass 1: alpha-2 (P297) + flag filename (P41) for every country. P41 can be
  // multi-valued, so pick deterministically.
  const { iso, flags } = await fetchClaims(countries.map((c) => c.id));

  // Build the working set, keyed and sorted by alpha-2 for stable output. A
  // country missing P297 or P41 is a data gap worth surfacing, not skipping.
  const rows = countries
    .map((c) => ({
      ...c,
      alpha2: iso.get(c.id),
      filename: flags.has(c.id) ? pickFlag(flags.get(c.id)) : undefined,
    }))
    .sort((a, b) => (a.alpha2 ?? "").localeCompare(b.alpha2 ?? ""));
  const missing = rows.filter((r) => !r.alpha2 || !r.filename);
  if (missing.length) {
    throw new Error(
      `missing P297/P41 for: ${missing.map((m) => `${m.label} (${m.id})`).join(", ")}`,
    );
  }

  // Wipe + rebuild assets so a removed country's flag does not linger.
  const assetsDir = new URL("assets/", import.meta.url);
  for (const f of readdirSync(assetsDir).filter((f) => f.endsWith(".svg"))) {
    rmSync(new URL(f, assetsDir));
  }
  mkdirSync(assetsDir, { recursive: true });

  // Download each SVG + record provenance. Commons rate-limits bursts (HTTP
  // 429), so downloads are serialized with a small delay and retried with
  // backoff that honors Retry-After.
  const provenance = [];
  for (const r of rows) {
    const svg = await downloadFlag(r);
    writeFileSync(new URL(`${r.alpha2}.svg`, assetsDir), svg);
    provenance.push({
      qid: r.id,
      country: r.label,
      alpha2: r.alpha2,
      filename: r.filename,
      sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(r.filename)}`,
    });
  }

  // Per-file license from Commons, folded into provenance.
  const licenses = await fetchLicenses(provenance.map((p) => p.filename));
  for (const p of provenance) p.license = licenses.get(p.filename) ?? "unknown";

  // Emit statements (sorted by alpha-2, same as rows). alt is deliberately
  // generic so the answer never leaks to assistive tech or view-source (#180).
  const statements = rows.map((r) =>
    JSON.stringify({
      id: `flag:${r.alpha2}`,
      subject: r.id,
      relation: "flag",
      object: {
        kind: "literal",
        literal: { datatype: "image", value: { src: `/flags/${r.alpha2}.svg`, alt: "Flag of a country" } },
      },
    }),
  );
  writeFileSync(new URL("statements.jsonl", import.meta.url), statements.join("\n") + "\n");
  writeFileSync(new URL("provenance.json", import.meta.url), JSON.stringify(provenance, null, 2) + "\n");
  process.stderr.write(`wrote ${statements.length} statements, ${provenance.length} flags\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
