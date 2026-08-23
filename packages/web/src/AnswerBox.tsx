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

  function choose(entity: EntitySummary) {
    onChange(entity.label);
    setDismissed(true);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      // A highlighted suggestion commits to the box, not to the answer.
      event.preventDefault();
      choose(suggestions[activeIndex]!);
    } else if (event.key === "Escape") {
      setDismissed(true);
      setActiveIndex(-1);
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
          autoComplete="off"
          autoFocus
        />
        {showList && (
          <ul className="answer-suggestions" id={LISTBOX_ID} role="listbox">
            {suggestions.map((entity, i) => (
              <li
                key={entity.id}
                id={`${LISTBOX_ID}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={`answer-suggestion${i === activeIndex ? " answer-suggestion--active" : ""}`}
              >
                <button
                  type="button"
                  className="answer-suggestion__button"
                  // mousedown, not click: it fires before the input's blur, so a
                  // tap still selects even as focus leaves the field.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(entity);
                  }}
                >
                  {entity.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="btn-primary" type="submit">
        Submit
      </button>
    </form>
  );
}
