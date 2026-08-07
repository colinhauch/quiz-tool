# Geography Learning Engine

A quiz app that teaches world geography from a knowledge graph, tracks every answer, and surfaces knowledge gaps. The engine owns learning; packs own domains.

## Language

### Content

**Pack**:
One authored unit of content — a bounded set of facts about a topic, plus the code to quiz them. The same word covers it on disk and in memory; there is no separate loaded form.
_Avoid_: Tranche, plugin, module, bundle

**Graph**:
Every loaded pack fused into the single body of knowledge the engine quizzes from. There is exactly one at runtime.
_Avoid_: Merged pack, world, corpus, library

**Entity**:
A thing the graph knows about — a city, a country, a continent. Identified by its Wikidata Q-ID.
_Avoid_: Node, item, record

**Statement**:
One fact, as a subject–relation–object triple. The atomic unit of knowledge, and what every logged answer points at.
_Avoid_: Fact, triple, assertion, claim

**Relation**:
The kind of link a statement asserts, such as `located_in`. Its identifier is global: exactly one pack defines it, and it means the same thing everywhere in the graph.
_Avoid_: Predicate, property, edge type

**Owner**:
The single pack that defines a given entity. Other packs assert statements about that entity without redefining it; two packs claiming one entity is an authoring error.
_Avoid_: Source, provider, home pack

### Quizzing

**Card**:
A statement paired with the slot a question conceals — the unit that is actually selected, asked, and graded. One statement can yield several cards.
_Avoid_: Item, prompt, flashcard

**Hidden Slot**:
Which part of a statement the learner has to supply: its subject or its object.
_Avoid_: Blank, gap, target, masked field

**Question Kind**:
The form a question takes and therefore how its answer is judged — typed text, multiple choice, and later numeric or date. The engine defines the available kinds; a pack chooses among them.
_Avoid_: Question type, format, template, mode

**Generator**:
Pack-supplied code that turns one of its statements into a question's content. It decides how a fact is phrased; it does not decide how the answer is graded.
_Avoid_: Renderer, formatter, template function

**Distractor**:
A plausible but wrong option offered alongside the correct one in a multiple-choice question.
_Avoid_: Decoy, foil, wrong answer
