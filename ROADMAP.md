# Roadmap

Project planning, not architecture. This has a short lifespan by design — the durable concepts live in [specs/](specs/).

## MVP

**Ships:** the entity / relation-type / statement model · one hand-built `core-cities` pack (~300 cities: city→country and country→continent, English labels and aliases) · forward and reverse multiple choice · answer log, cards, and a trivial random-least-recent scheduler behind the `Scheduler` interface · the region × relation accuracy screen · SQLite behind repository interfaces · a single hardcoded local user.

**Non-goals:** accounts and sync · images and maps · GIS/geometry · a pack authoring UI · the Wikidata import tooling itself (the *format* must support it; building it is post-MVP).

## Deferred, and why each is cheap later

Each of these was designed for and costs a seam, not a refactor:

| Deferred | Why it's cheap |
|---|---|
| FSRS scheduling | Interface swap — see [specs/learning/](specs/learning/) |
| New packs (languages, currencies, borders, population, `aka`) | Data plus relation registration only — see [specs/packs/](specs/packs/) |
| Qualifier and temporal questions | The log already references statements, so qualifiers are already quizzable |
| Images | Template capability matching; packs without images never trigger them |
| Text-input answers | Aliases are already stored per language |
| Multilingual quizzing | Labels are already keyed by language |
| Accounts and sync | `user_id` is already on every user-side row |
| Import tooling | The pack format already mirrors Wikidata |
| Graph database | Repo swap, with the trigger stated in [specs/storage/](specs/storage/) |

That table is the payoff of the whole design. If any row stops being true, the architecture has drifted from its intent and the relevant spec should say so.
