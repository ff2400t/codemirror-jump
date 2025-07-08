import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { keymap } from "@codemirror/view";

// State effects for managing easymotion state
const setEasyMotionState = StateEffect.define<EasyMotionStateField | null>();
const clearEasyMotionState = StateEffect.define();

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

type EasyMotionStateField = {
  active: boolean;
  hints: Map<number, string>;
  currentInput: string;
};

// State field to track easymotion state
const easyMotionState = StateField.define<EasyMotionStateField>({
  create() {
    return { active: false, hints: new Map(), currentInput: "" };
  },

  update(value, tr) {
    for (let effect of tr.effects) {
      if (effect.is(setEasyMotionState)) {
        return effect.value!;
      }
      if (effect.is(clearEasyMotionState)) {
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

// Generate hint characters (using common easy motion characters)
function generateHints(count: number): string[] {
  const chars =
    "abcdefghijklmnopqrstuvwxyz";
  const hints = [];

  const base = chars.length;
  for (let i = 0; i < count; i++) {
    const first = Math.floor(i / base);
    const second = i  % base;
    hints.push(chars[first] + chars[second]);
  }

  return hints;
}

// Find all word boundaries and other jump targets
function findJumpTargets(view: EditorView) {
  const doc = view.state.doc;
  const targets = [];
  const visibleRanges = view.visibleRanges;

  for (let range of visibleRanges) {
    const text = doc.sliceString(range.from, range.to);
    let pos = range.from;

    // Find word boundaries
    const wordRegex = /\b\w/g;
    let match;
    while ((match = wordRegex.exec(text)) !== null) {
      targets.push(pos + match.index);
    }

    // Find line beginnings (non-whitespace)
    const lines = text.split("\n");
    let lineStart = range.from;
    for (let line of lines) {
      const firstNonWhite = line.search(/\S/);
      if (firstNonWhite !== -1) {
        targets.push(lineStart + firstNonWhite);
      }
      lineStart += line.length + 1;
    }
  }

  // Remove duplicates and sort
  return [...new Set(targets)].sort((a, b) => a - b);
}

// Decoration plugin for showing hints
const easyMotionDecorations = ViewPlugin.fromClass(
  class {
    decorations: any;
    constructor(view: EditorView) {
      this.decorations = Decoration.none;
      this.update(view as any as ViewUpdate);
    }

    update(update: ViewUpdate) {
      const state = update.state.field(easyMotionState);

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

// Main easymotion functionality
function activateEasyMotion(view: EditorView) {
  const targets = findJumpTargets(view);
  if (targets.length === 0) return false;

  const hints = generateHints(targets.length);
  const hintMap = new Map();

  targets.forEach((pos, i) => {
    hintMap.set(pos, hints[i]);
  });

  view.dispatch({
    effects: setEasyMotionState.of({
      active: true,
      hints: hintMap,
      currentInput: "",
    }),
  });

  return true;
}

function handleEasyMotionInput(view: EditorView, key: string) {
  const state: EasyMotionStateField = view.state.field(easyMotionState);
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
    // No matches, clear easymotion
    view.dispatch({
      effects: clearEasyMotionState.of(null),
    });
    return true;
  }

  if (matches.length === 1 && matches[0].hint === newInput) {
    // Exact match, jump to position
    view.dispatch({
      selection: EditorSelection.cursor(matches[0].pos),
      effects: clearEasyMotionState.of(null),
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
    effects: setEasyMotionState.of(effect),
  });

  return true;
}

// Keymap for easymotion
const easyMotionKeymap = keymap.of([
  {
    key: "Ctrl-;",
    run: (view) => {
      const state = view.state.field(easyMotionState);
      if (state.active) {
        // If already active, clear it
        view.dispatch({
          effects: clearEasyMotionState.of(null),
        });
      } else {
        // Activate easymotion
        activateEasyMotion(view);
      }
      return true;
    },
  },
  {
    key: "Escape",
    run: (view) => {
      const state = view.state.field(easyMotionState);
      if (state.active) {
        view.dispatch({
          effects: clearEasyMotionState.of(null),
        });
        return true;
      }
      return false;
    },
  },
]);

// Handle character input during easymotion
const easyMotionInputHandler = EditorView.domEventHandlers({
  keydown(event, view) {
    const state = view.state.field(easyMotionState);
    if (!state.active) return false;

    // Handle alphanumeric input
    if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) {
      event.preventDefault();
      return handleEasyMotionInput(view, event.key);
    }

    // Handle escape
    if (event.key === "Escape") {
      event.preventDefault();
      view.dispatch({
        effects: clearEasyMotionState.of(null),
      });
      return true;
    }

    return false;
  },
});

// Export the complete easymotion extension
export default function jump() {
  return [
    easyMotionState,
    easyMotionDecorations,
    easyMotionKeymap,
    easyMotionInputHandler,
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
