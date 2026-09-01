import type { EntitySummary } from "@geo/contract";
import { type KeyboardEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { displayLabel, filterSuggestions, loadSuggestionEntities } from "./suggestions.js";

interface AnswerBoxProps {
  value: string;
  onChange: (value: string) => void;
  /** The kind(s) of entity the answer names; suggestions are scoped to these. */
  answerTypes: string[];
  /** When false, the plain input with no suggestions (the pre-autocomplete box). */
  suggestEnabled?: boolean;
  /** Once answered, the box shows the submitted answer greyed out and non-editable — no
   *  suggestions, no focus stealing. The typed answer stays visible beside the verdict. */
  disabled?: boolean;
  /** Focused after picking a suggestion, so a keyboard learner's next Enter
   *  submits rather than re-opening suggestions in the input. Owned by the
   *  caller: the submit control lives outside this component (#187). */
  submitButtonRef?: RefObject<HTMLButtonElement | null>;
}

const LISTBOX_ID = "answer-suggestions";

/**
 * The answer input with type-scoped autocomplete. As the learner types, a
 * list of candidate entities appears directly beneath the field. On narrow
 * screens it sits in normal flow, pushing the Submit button down — a dropdown
 * that overlaps gets hidden behind a phone keyboard. On desktop (#188) it's
 * an out-of-flow overlay instead, so showing/hiding it never shifts the
 * input, verdict, or button; that split is CSS-only (see `.answer-suggestions`
 * in index.css), the markup here is identical at both widths. Choosing
 * a suggestion fills the box with that entity's canonical label; it never
 * submits. Free-text the learner types instead of picking is submitted as-is.
 * With `suggestEnabled` off it is exactly the old plain input.
 *
 * Renders only the field (+ suggestions) — no `<form>` or submit button. The
 * caller owns those, since where the button sits relative to the field
 * differs by layout (#187).
 */
export function AnswerBox({
  value,
  onChange,
  answerTypes,
  suggestEnabled = true,
  disabled = false,
  submitButtonRef,
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
    onChange(displayLabel(entity));
    setDismissed(true);
    setActiveIndex(-1);
    // Move to Submit so a keyboard learner's next Enter sends the answer, rather
    // than re-opening suggestions in the input. One pick, one Enter, done.
    submitButtonRef?.current?.focus();
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

  const showList = !disabled && suggestions.length > 0;

  // Answered: the submitted answer, shown greyed and non-editable so the learner
  // can still read what they typed. No combobox semantics, no suggestions, and
  // no autofocus — focus goes to the Next button (the caller manages that).
  if (disabled) {
    return (
      <input
        className="quiz-input"
        aria-label="Your answer"
        value={value}
        disabled
        readOnly
      />
    );
  }

  // With suggestions off, the box is the plain pre-autocomplete input: no
  // combobox semantics, so a screen reader announces exactly today's field.
  if (!suggestEnabled) {
    return (
      <input
        className="quiz-input"
        aria-label="Your answer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
      />
    );
  }

  return (
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
                // onClick (not onMouseDown) so a keyboard learner who Tabs onto
                // a suggestion and presses Enter selects it — Enter on a focused
                // button fires click, never mousedown. The list isn't focus-
                // gated, so a mouse blur can't hide it before the click lands.
                onClick={() => choose(entity)}
                // Keep the styled highlight tracking Tab focus, not just arrows.
                onFocus={() => setActiveIndex(i)}
              >
                {displayLabel(entity)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
