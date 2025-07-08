import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { keymap } from "@codemirror/view";

// State effects for managing jump state
const setJumpState = StateEffect.define<JumpStateField | null>();
const clearJumpState = StateEffect.define();

// Widget for displaying hint characters
class HintWidget extends WidgetType {
  hint: string;
  constructor(hint: string) {
    super();
    this.hint = hint;
  }

  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.hint;
    span.classList.add("cm-jump-hint");
    return span;
  }
}

type JumpStateField = {
  active: boolean;
  hints: Map<number, string>;
  currentInput: string;
};

// State field to track jump state
const jumpState = StateField.define<JumpStateField>({
  create() {
    return { active: false, hints: new Map(), currentInput: "" };
  },

  update(value, tr) {
    for (let effect of tr.effects) {
      if (effect.is(setJumpState)) {
        return effect.value!;
      }
      if (effect.is(clearJumpState)) {
        return {
          active: false,
          hints: new Map<number, string>(),
          currentInput: "",
        };
      }
    }
    return value;
  },
});

// Generate hint characters (using common jump characters)
// Generate hints with increasing character lengths (2-char, then 3-char, etc.)
function generateHints(count: number) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const hints: string[] = [];
  let length = 2; // Start with 2-character hints

  while (hints.length < count) {
    // Generate all combinations of current length
    const generateCombinations = (currentLength: number, prefix = "") => {
      if (prefix.length === currentLength) {
        hints.push(prefix);
        return;
      }

      for (let i = 0; i < chars.length && hints.length < count; i++) {
        generateCombinations(currentLength, prefix + chars[i]);
      }
    };

    generateCombinations(length);
    length++; // Move to next length if we need more hints
  }

  return hints.slice(0, count);
}

// Find all word boundaries and other jump targets
function findJumpTargets(view: EditorView) {
  const doc = view.state.doc;
  const targets = [];
  const cursorPos = view.state.selection.main.head;
  const visibleRanges = view.visibleRanges;

  for (let range of visibleRanges) {
    const text = doc.sliceString(range.from, range.to);

    // Find word boundaries with words that are longer than two alphabets
    const wordRegex = /\b\w{2,}/g;
    let match;

    while ((match = wordRegex.exec(text)) !== null) {
      const pos = range.from + match.index;
      // Don't include the current cursor position as a target
      if (pos !== cursorPos) {
        targets.push(pos);
      }
    }
  }

  // Remove duplicates and sort
  return [...new Set(targets)].sort((a, b) => a - b);
}

// Decoration plugin for showing hints
const jumpDecorations = ViewPlugin.fromClass(
  class {
    decorations: any;
    constructor(view: EditorView) {
      this.decorations = Decoration.none;
      this.update(view as any as ViewUpdate);
    }

    update(update: ViewUpdate) {
      const state = update.state.field(jumpState);

      if (!state.active) {
        this.decorations = Decoration.none;
        return;
      }

      const decorations = [];
      for (let [pos, hint] of state.hints) {
        decorations.push(
          Decoration.widget({
            widget: new HintWidget(hint),
            side: 0,
          }).range(pos),
        );
      }

      this.decorations = Decoration.set(decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// Main jump functionality
function activateJump(view: EditorView) {
  const targets = findJumpTargets(view);
  if (targets.length === 0) return false;

  const hints = generateHints(targets.length);
  const hintMap = new Map();

  targets.forEach((pos, i) => {
    hintMap.set(pos, hints[i]);
  });

  view.dispatch({
    effects: setJumpState.of({
      active: true,
      hints: hintMap,
      currentInput: "",
    }),
  });

  return true;
}

function handleJumpEnter(view: EditorView) {
  const state: JumpStateField = view.state.field(jumpState);
  // find early match
  for (let [pos, hint] of state.hints) {
    if (hint == state.currentInput) {
      view.dispatch({
        selection: EditorSelection.cursor(pos),
        effects: clearJumpState.of(null),
        scrollIntoView: true,
      });
    }
  }

  // if no match is found clear jump state
  view.dispatch({
    effects: clearJumpState.of(null),
  });
}

function handleJumpInput(view: EditorView, key: string) {
  const state: JumpStateField = view.state.field(jumpState);
  if (!state.active) return false;

  const newInput = state.currentInput + key;

  // Find matching hints
  const matches = [];
  for (let [pos, hint] of state.hints) {
    if (hint.startsWith(newInput)) {
      matches.push({ pos, hint });
    }
  }

  if (matches.length === 0) {
    // No matches, clear jump
    view.dispatch({
      effects: clearJumpState.of(null),
    });
    return true;
  }

  if (matches.length === 1 && matches[0].hint === newInput) {
    // Exact match, jump to position
    view.dispatch({
      selection: EditorSelection.cursor(matches[0].pos),
      effects: clearJumpState.of(null),
      scrollIntoView: true,
    });
    return true;
  }

  // Update current input and filter hints
  const newHints = new Map<number, string>();
  matches.forEach(({ pos, hint }) => {
    newHints.set(pos, hint);
  });

  const effect = {
    active: true,
    hints: newHints,
    currentInput: newInput,
  };

  view.dispatch({
    effects: setJumpState.of(effect),
  });

  return true;
}

// Keymap for jump
const jumpKeymap = keymap.of([
  {
    key: "Ctrl-;",
    run: (view) => {
      const state = view.state.field(jumpState);
      if (state.active) {
        // If already active, clear it
        view.dispatch({
          effects: clearJumpState.of(null),
        });
      } else {
        // Activate jump
        activateJump(view);
      }
      return true;
    },
  },
  {
    key: "Escape",
    run: (view) => {
      const state = view.state.field(jumpState);
      if (state.active) {
        view.dispatch({
          effects: clearJumpState.of(null),
        });
        return true;
      }
      return false;
    },
  },
]);

// We need Keymap to be seperate so that it has higher precedence.
const jumpEnterKeymap = keymap.of([
  {
    key: "Enter",
    run: (view) => {
      console.log("abc");
      const state = view.state.field(jumpState);
      if (state.active) {
        handleJumpEnter(view);
        return true;
      }
      return false;
    },
  },
]);

// Handle character input during jump
const jumpInputHandler = EditorView.domEventHandlers({
  keydown(event, view) {
    console.log(event);
    const state = view.state.field(jumpState);
    if (!state.active) return false;

    // Handle alphanumeric input
    if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
      event.preventDefault();
      return handleJumpInput(view, event.key);
    }

    // Handle escape
    if (event.key === "Escape") {
      event.preventDefault();
      view.dispatch({
        effects: clearJumpState.of(null),
      });
      return true;
    }

    return false;
  },
});

// Export the complete jump extension
export default function jump() {
  return [
    jumpState,
    jumpDecorations,
    Prec.high(jumpEnterKeymap),
    jumpKeymap,
    jumpInputHandler,
    // Add some basic styling
    EditorView.theme({
      ".cm-jump-hint": {
        position: "absolute",
        background: "#ff6b6b",
        color: "white",
        fontWeight: "bold",
        fontSize: "12px",
        padding: "2px 4px",
        borderRadius: "3px",
        zIndex: 1000,
        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        fontFamily: "monospace",
        lineHeight: 1,
        marginTop: "-2px",
        marginLeft: "-2px",
      },
    }),
  ];
}
