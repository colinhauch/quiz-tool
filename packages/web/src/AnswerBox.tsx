import type { EntitySummary } from "@geo/contract";
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { filterSuggestions, loadSuggestionEntities } from "./suggestions.js";

interface AnswerBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** The kind(s) of entity the answer names; suggestions are scoped to these. */
  answerTypes: string[];
  /** When false, the plain input with no suggestions (the pre-autocomplete box). */
  suggestEnabled?: boolean;
}

const LISTBOX_ID = "answer-suggestions";

/**
 * The answer input with type-scoped autocomplete. As the learner types, an
 * inline list of candidate entities appears directly beneath the field (in
 * normal flow, so it pushes the Submit button down rather than floating over
 * it — a dropdown that overlaps gets hidden behind a phone keyboard). Choosing
 * a suggestion fills the box with that entity's canonical label; it never
 * submits. Free-text the learner types instead of picking is submitted as-is.
 * With `suggestEnabled` off it is exactly the old plain input.
 */
export function AnswerBox({
  value,
  onChange,
  onSubmit,
  answerTypes,
  suggestEnabled = true,
}: AnswerBoxProps) {
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  // Load (and cache) the entities to suggest whenever the answer types change.
  // The current list is cleared first so a stale question's names can't flash
  // under the next question before its own list arrives. Skipped entirely when
  // suggestions are off, so no fetch happens for a learner who opted out.
  useEffect(() => {
    if (!suggestEnabled) {
      setEntities([]);
      return;
    }
    let live = true;
    setEntities([]);
    loadSuggestionEntities(answerTypes)
      .then((list) => live && setEntities(list))
      .catch(() => live && setEntities([]));
    return () => {
      live = false;
    };
  }, [answerTypes, suggestEnabled]);

  const suggestions = useMemo(
    () => (suggestEnabled && !dismissed ? filterSuggestions(value, entities) : []),
    [suggestEnabled, dismissed, value, entities],
  );

  // A fresh keystroke re-opens the list and resets the highlight.
  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  // Taking a suggestion fills the box and moves focus to Submit, so the whole
  // flow stays on the keyboard: type → walk the list → Enter to commit the name
  // → Enter again to submit the answer.
  function choose(entity: EntitySummary) {
    onChange(entity.label);
    setDismissed(true);
    setActiveIndex(-1);
    submitRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    const last = suggestions.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => (i >= last ? 0 : i + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => (i <= 0 ? last : i - 1));
        break;
      case "Tab":
        // Tab walks the list instead of leaving the field. At the ends it stops
        // intercepting, so a further Tab falls through to Submit (forward) or
        // back out of the box (backward) — the natural way off the list.
        if (event.shiftKey ? activeIndex > 0 : activeIndex < last) {
          event.preventDefault();
          setActiveIndex((i) => i + (event.shiftKey ? -1 : 1));
        }
        break;
      case "Enter":
        // A highlighted suggestion commits to the box, not to the answer; with
        // nothing highlighted, Enter falls through and the form submits.
        if (activeIndex >= 0) {
          event.preventDefault();
          choose(suggestions[activeIndex]!);
        }
        break;
      case "Escape":
        event.preventDefault();
        setDismissed(true);
        setActiveIndex(-1);
        break;
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  const showList = suggestions.length > 0;

  // With suggestions off, the box is the plain pre-autocomplete input: no
  // combobox semantics, so a screen reader announces exactly today's field.
  if (!suggestEnabled) {
    return (
      <form className="quiz-form" onSubmit={handleSubmit}>
        <input
          className="quiz-input"
          aria-label="Your answer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
        <button className="btn-primary" type="submit">
          Submit
        </button>
      </form>
    );
  }

  return (
    <form className="quiz-form" onSubmit={handleSubmit}>
      <div className="answer-combobox">
        <input
          ref={inputRef}
          className="quiz-input"
          aria-label="Your answer"
          role="combobox"
          aria-expanded={showList}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${LISTBOX_ID}-${activeIndex}` : undefined}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setDismissed(false);
          }}
          onKeyDown={handleKeyDown}
          // Closing on blur hides the list once focus leaves for Submit; mouse
          // selection uses mousedown (below), which fires before blur, so a
          // click still lands.
          onBlur={() => setDismissed(true)}
          autoComplete="off"
          autoFocus
        />
        {showList && (
          <ul className="answer-suggestions" id={LISTBOX_ID} role="listbox">
            {suggestions.map((entity, i) => (
              // The row is not a focusable control: focus stays in the input and
              // aria-activedescendant tracks the highlight, so keyboard and
              // pointer drive the same single selection path. mousedown (not
              // click) fires before the input's blur, so a tap still selects.
              <li
                key={entity.id}
                id={`${LISTBOX_ID}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={`answer-suggestion${i === activeIndex ? " answer-suggestion--active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(entity);
                }}
              >
                {entity.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button ref={submitRef} className="btn-primary" type="submit">
        Submit
      </button>
    </form>
  );
}
