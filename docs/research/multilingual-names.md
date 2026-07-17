# How knowledge-graph systems model multilingual names

Research for [#8](https://github.com/colinhauch/quiz-tool/issues/8). Answers how the field works; **does not recommend a design for this app** — that call is the dev's.

**Sourcing.** Claims below cite primary sources: the Wikibase data model docs, Wikidata's own help/glossary pages, RFC 4647, CLDR's `supplementalData.xml`, and MediaWiki source. Where a statement is my inference rather than something a source says, it is marked **[inference]**. Where I could not verify something, it says so.

---

## 1. Wikidata's three-way split: label / alias / description

The Wikibase data model states the cardinality directly:

> "for any given language, an EntityDescription may have at most one label and at most one description, but any number of aliases."
> — [Wikibase/DataModel](https://www.mediawiki.org/wiki/Wikibase/DataModel)

Each of the three buys a distinct thing, and the docs assign each a different job:

- **Label** — "the main label to be used for representing the described Entity" ([DataModel](https://www.mediawiki.org/wiki/Wikibase/DataModel)); "the most common name that the item would be known by", which should "reflect common usage" ([Help:Label](https://www.wikidata.org/wiki/Help:Label)). It is the *display* slot. Exactly one per language because a renderer needs a single deterministic answer to "what do I print?" — a set would force the caller to choose, every time.
- **Description** — "a brief description to clarify the meaning of the label (which may be ambiguous)... mainly for disambiguation" ([DataModel](https://www.mediawiki.org/wiki/Wikibase/DataModel)). It exists because labels are *not unique*. The model makes this load-bearing: "the combination of label and description is a key for one particular language, if both label and description are defined" ([DataModel](https://www.mediawiki.org/wiki/Wikibase/DataModel)). Description restores the uniqueness the label alone lacks.
- **Alias** — "alternative labels in various languages, used mainly for searching for items by their name" ([DataModel](https://www.mediawiki.org/wiki/Wikibase/DataModel)). It is the *recall* slot: many per language, never displayed as the canonical name.

So the split is not three flavours of "name". It is **one display slot, one disambiguation slot, one recall slot**, and the cardinalities (1, 1, N) fall out of those jobs.

Note a real asymmetry: for **properties**, "the label is a key for one particular language" — properties are identified by label in a way items are not ([DataModel](https://www.mediawiki.org/wiki/Wikibase/DataModel)). Item labels carry no such uniqueness guarantee.

**On inheriting Q-IDs.** Wikidata's glossary calls label/description/alias collectively a **Term**: "a part of entity, includes label, description and alias" ([Wikidata:Glossary](https://www.wikidata.org/wiki/Wikidata:Glossary)). Q-IDs and terms are separable — the Q-ID is the identity; the term store is a display/search index keyed by it. **[inference]** Inheriting Q-IDs commits you to Wikidata's *identity* model (opaque stable IDs; names as data rather than as keys). It does not by itself commit you to the three-slot term shape, which is a consequence of Wikidata's own requirements: a multilingual UI, human-facing search over ~100M items, and non-unique labels needing disambiguation. Which of those requirements a given app shares is the actual question, and no source answers it for you.

## 2. Label-as-field vs. label-as-statement — where the line is drawn

The glossary is explicit that terms sit outside the statement graph: labels, aliases and descriptions "appear separately from statements in the termbox" and "exist independently from the statement graph" ([Wikidata:Glossary](https://www.wikidata.org/wiki/Wikidata:Glossary)). Meanwhile a **Statement** is "a claim... augmented by references... and a rank" ([Wikidata:Glossary](https://www.wikidata.org/wiki/Wikidata:Glossary)).

That definition is where the line comes from. A statement's whole apparatus is **qualifiers, references, and rank**. P1448 (official name) demonstrates exactly this: it is monolingual-text-typed and its allowed qualifiers include **start time, end time, language, and location** ([P1448](https://www.wikidata.org/wiki/Property:P1448)). P1705 (native label) is "label for the items in their official language or their original language", also monolingual text, with a single-value constraint relaxed "unless there are several native names" ([P1705](https://www.wikidata.org/wiki/Property:P1705)).

The line, as the sources draw it:

| | Term (label/alias/description) | Statement (P1448, P1705) |
|---|---|---|
| Job | render / find / disambiguate in a UI | assert a fact *about* the name |
| Time-bounded | no | yes (start/end time qualifiers) |
| Sourced | no | yes (references) |
| Contested | no | yes (rank picks a winner) |
| Cardinality | 1 / N / 1 per language | many, qualified |

**The operative test [inference, but well-supported by the qualifier lists above]:** if the name is a *fact that can be true during a period, sourced, or disputed*, it needs statement machinery. If it is *the string a UI prints*, that machinery is pure overhead and a term field suffices. "Burma" → "Myanmar" is a fact with a date and a citation; which of the two you print in a dropdown today is a display choice. Wikidata needs both because it is answering both questions.

The two are not redundant in practice: a country's English label ("Germany"), its official name (P1448, "Bundesrepublik Deutschland"), and its native label (P1705) are genuinely different strings answering different questions ([P1448](https://www.wikidata.org/wiki/Property:P1448), [P1705](https://www.wikidata.org/wiki/Property:P1705)).

**What I could not verify:** I found no primary source stating the *historical* rationale for keeping labels out of the statement graph (i.e. a recorded design discussion). [Help:Label](https://www.wikidata.org/wiki/Help:Label) does not discuss sourcing requirements for labels at all. The table above is reconstructed from definitions and constraints, not from a recorded decision.

## 3. Fallback chains — the standard resolution

Three distinct mechanisms, commonly conflated.

**(a) BCP-47 Lookup — RFC 4647.** Lookup "is used to select the single language tag that best matches the language priority list for a given request", and works by truncation: "the language range is progressively truncated from the end until a matching language tag is located" ([RFC 4647](https://www.rfc-editor.org/rfc/rfc4647.html)). The RFC's own example:

```
zh-Hant-CN-x-private1-private2
zh-Hant-CN-x-private1
zh-Hant-CN
zh-Hant
zh
(default)
```

Crucially the default is neither optional nor specified for you: "Each application, protocol, or specification that uses lookup **MUST** define the defaulting behavior when no tag matches" ([RFC 4647](https://www.rfc-editor.org/rfc/rfc4647.html)). An `en` backstop is therefore *a policy you choose*, not something the spec hands you. Lookup returns one result; **Filtering** returns all matches and is the other scheme in the same RFC — a different job.

**(b) CLDR parent locales — truncation is not enough.** CLDR uses truncation-based inheritance up to `root`, but *overrides* it with explicit `parentLocale` mappings ([UTS #35](https://www.unicode.org/reports/tr35/tr35.html)). I verified these against the actual CLDR data rather than the prose ([`common/supplemental/supplementalData.xml`](https://github.com/unicode-org/cldr/blob/main/common/supplemental/supplementalData.xml)):

```xml
<parentLocale parent="root" locales="... yue_Hans zh_Hant"/>
<parentLocale parent="en_001" locales="... en_AU en_GB en_IN en_NZ en_ZA ..."/>
<parentLocale parent="en_150" locales="en_AT en_BE en_CH en_DE en_DK ..."/>
<parentLocale parent="es_419" locales="es_AR es_BO es_CL es_CO es_MX es_US ..."/>
<parentLocale parent="pt_PT" locales="pt_AO pt_CV pt_MO pt_MZ ..."/>
<parentLocale parent="no"   locales="nb nn no_NO"/>
```

Read those carefully — they are the point. Naive truncation says `zh_Hant` → `zh`; CLDR says `zh_Hant` → **`root`**, so Traditional Chinese cannot silently inherit Simplified data. Truncation says `en_AU` → `en`; CLDR routes it via `en_001` (world English) to pick up international rather than US conventions. Truncation says `pt_AO` → `pt`; CLDR sends it to `pt_PT`, not Brazilian Portuguese. **Truncation alone gets all three wrong.** That is the substantive content of "CLDR parent locales", and the reason it is a data table rather than an algorithm.

**(c) The `en` backstop, as actually implemented.** MediaWiki builds chains like `['pfl', 'de', 'en']` ([Manual:Language](https://www.mediawiki.org/wiki/Manual:Language)). In source, the `en` terminal is *conditional on mode*, not unconditional:

```php
// LanguageFallbackMode::MESSAGES
$this->localisationCache->getItem( $code, 'fallbackSequence' ) ?: [ 'en' ],
// LanguageFallbackMode::STRICT
$this->localisationCache->getItem( $code, 'originalFallbackSequence' ),
```
— [LanguageFallback.php](https://doc.wikimedia.org/mediawiki-core/master/php/LanguageFallback_8php_source.html)

MESSAGES mode guarantees a backstop; STRICT mode deliberately does not, letting a caller distinguish "no translation" from "English". Wikibase exposes fallback at the API level via the `languagefallback` parameter on `wbgetentities`: "Apply language fallback for languages defined in the languages parameter, with the current context of API call" ([API docs](https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities)).

*Not verified:* whether the `wbgetentities` response marks a fallen-back term with the language it actually came from. The API help defines the parameter but not the response shape for that case, and I found no primary source that does. (I suspect Wikibase does report this, but could not confirm it from a source that owns the claim — treat as unknown.)

**Does `name: string` force a re-solve later?** Note what the above shows: *resolution is a function*, `(entity, requested_locale) → string`. A `name: string` design is that function with the locale argument dropped and the body hardcoded to `en`. **[inference]** The re-solve is unavoidable in the sense that the policy (chain + backstop + missing-value behaviour) must eventually be written either way — it does not exist yet in either design. What a bare string costs is not the policy but the *seam*: there is no single place to put that function later, because every call site already holds a resolved string. See §4.

## 4. The retrofit cost, concretely

Splitting it the way the issue asks — data vs. code.

**Data.** This is the asymmetric half, and it is asymmetric because of the pack's generation model (generated once by a throwaway SPARQL script, output committed, script unmaintained). Labels in other languages are not *derivable* from an English string — you cannot compute "Deutschland" from "Germany". They must be re-fetched from Wikidata, meaning either reviving the throwaway script or writing a new one against the same Q-IDs. **[inference]** Because Q-IDs are preserved in the pack, that re-fetch is *possible*: the Q-ID is the join key, and Wikidata serves all labels for a Q-ID in one call. That makes the data retrofit a bounded, mechanical re-extraction rather than a re-modelling. The cost is real (rebuilding tooling that was deliberately discarded) but it is not data *loss* — nothing becomes unrecoverable. This is the single most consequential claim in this section, and it is my inference, not a sourced fact.

**Code.** Here the sources point the other way. RFC 4647's Lookup takes a *language priority list* and returns one tag — inherently a call-with-context operation ([RFC 4647](https://www.rfc-editor.org/rfc/rfc4647.html)). Retrofitting means every site that reads a name must acquire a locale argument to pass. **[inference]** The difficulty is not the type change (`string` → `Record<string, string>` is a compiler-guided edit; the type checker enumerates every call site for you). It is that the locale must be *threaded* to each site from wherever request context lives. If name-reads funnel through a few accessors, this is small; if they are scattered across templates and question generators, the checker will still find them all, but each fix carries a plumbing decision. TypeScript makes this a loud, finite refactor rather than a silent one.

Against the issue's framing: **the pain sits in the code, but the pack's generation model is what makes the data half worth thinking about at all.** The halves fail differently — the code retrofit is noisy and bounded (compiler-enumerated); the data retrofit is quiet and needs discarded tooling resurrected. **[inference]** Neither is a dead end.

## 5. Aliases vs. accepting a typed answer — same job?

The sources are unusually clear that these are **different mechanisms**, and Wikidata says so via what it *excludes* from aliases. [Help:Aliases](https://www.wikidata.org/wiki/Help:Aliases) explicitly rules out:

> - "Alternative capitalization" — *because search is case-insensitive*
> - "Common spelling mistakes" — *because "future fuzzy searching will handle these"*
> - "Alternative word order for people names"

Read the parentheticals: each exclusion is justified by *another layer already handling it*. Wikidata is drawing a boundary between the **alias list** (genuinely different names: "scientific names for species, full names for people known by nicknames, alternative transliteration systems, ASCII versions of non-ASCII titles" — [Help:Aliases](https://www.wikidata.org/wiki/Help:Aliases)) and the **matching layer** (case-folding, fuzzy matching), which is not the alias list's job.

That maps onto the issue's question directly:

- **Aliases answer "is this a name for this thing?"** — a *vocabulary* question. "PRC" and "China" are different names; no amount of string normalization derives one from the other, so they must be stored.
- **Normalization/fuzzy matching answers "did the user mean this string?"** — a *tolerance* question. "chnia", "CHINA", "china " are not different names; they are one name typed imperfectly. Storing those as aliases is exactly what Wikidata forbids, and the stated reason is that the matching layer handles them.

**[inference]** So an alias list is a *necessary but not sufficient* input to grading typed answers: it supplies the set of acceptable distinct names, over which a separate normalization/fuzzy layer matches. Aliases without fuzzy matching reject a typo; fuzzy matching without aliases rejects "PRC". They compose; neither substitutes for the other.

**Per-language collation is a third thing again.** Collation is ordering/comparison, defined against CLDR/DUCET data in the root locale and tailored per locale ([UTS #35](https://www.unicode.org/reports/tr35/tr35.html)). **[inference]** Its relevance here is that "equal" is locale-dependent for answer-checking: whether "ö" should match "o", or Turkish dotless "ı" match "i", is a locale-tailored question rather than a universal one — so a typed-answer grader becomes locale-parameterized once it goes multilingual. I found no primary source treating collation specifically as an answer-grading mechanism; the ordering/comparison semantics are sourced, the application to quiz grading is mine.

---

## Sources

All accessed 2026-07-17.

- [Wikibase/DataModel](https://www.mediawiki.org/wiki/Wikibase/DataModel) — cardinality, uniqueness, label/description/alias purposes
- [Wikidata:Glossary](https://www.wikidata.org/wiki/Wikidata:Glossary) — Term vs Statement vs Claim; termbox separation
- [Help:Label](https://www.wikidata.org/wiki/Help:Label) — labels as common usage
- [Help:Aliases](https://www.wikidata.org/wiki/Help:Aliases) — alias purpose and exclusions
- [Help:Data type](https://www.wikidata.org/wiki/Help:Data_type) — monolingual text
- [Property:P1448](https://www.wikidata.org/wiki/Property:P1448) — official name, qualifiers
- [Property:P1705](https://www.wikidata.org/wiki/Property:P1705) — native label
- [RFC 4647](https://www.rfc-editor.org/rfc/rfc4647.html) — Lookup vs Filtering, truncation, mandatory default
- [UTS #35 (LDML)](https://www.unicode.org/reports/tr35/tr35.html) — locale inheritance, parent locales, collation
- [CLDR supplementalData.xml](https://github.com/unicode-org/cldr/blob/main/common/supplemental/supplementalData.xml) — verified parentLocale table
- [MediaWiki LanguageFallback.php](https://doc.wikimedia.org/mediawiki-core/master/php/LanguageFallback_8php_source.html) — MESSAGES vs STRICT backstop
- [Manual:Language](https://www.mediawiki.org/wiki/Manual:Language) — fallback sequences
- [wbgetentities API help](https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities) — `languagefallback` parameter

**Not verified / open:**
- Historical rationale for labels-outside-statements (no design-discussion source found).
- Whether `wbgetentities` reports the source language of a fallen-back term.
- Collation as an answer-grading mechanism (ordering semantics sourced; quiz application is inference).

**Note on placement:** no research-notes convention existed. `specs/` is for decisions and rationale (and its README discourages new reference files); this is external research informing a decision, not a decision, so it went in `docs/research/`.
