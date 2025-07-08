import {
  EditorSelection,
  type Extension,
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

// State effects for managing jump state
const setJumpState = StateEffect.define<JumpStateField | null>();
const clearJumpState = StateEffect.define();

// State field to track jump state
export const jumpState = StateField.define<JumpStateField>({
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

export default class JumpExt {
  hintChars: string;
  stateField: StateField<JumpStateField>;
  decorationPlugin: ViewPlugin<any, undefined>;
  inputHandler: Extension;
  keymap: Extension;

  constructor(hintChars = "abcdefghijklmnopqrstuvwxyz") {
    this.hintChars = hintChars;
    this.stateField = jumpState;
    this.decorationPlugin = this.createDecorationPlugin();
    this.inputHandler = this.createInputHandler();
    this.keymap = this.createKeymap();
  }

  createDecorationPlugin() {
    const stateField = this.stateField;

    return ViewPlugin.fromClass(
      class {
        decorations: any;
        constructor(view: EditorView) {
          this.decorations = Decoration.none;
          this.update(view as any as ViewUpdate);
        }

        update(update: ViewUpdate) {
          const state = update.state.field(stateField);

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
  }

  createInputHandler() {
    const stateField = this.stateField;
    const hintChars = this.hintChars;

    return EditorView.domEventHandlers({
      keydown: (event, view) => {
        const state = view.state.field(stateField);
        if (!state.active) return false;

        // Handle hint character input
        if (event.key.length === 1 && hintChars.includes(event.key)) {
          event.preventDefault();
          return this.handleJumpInput(view, event.key);
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
  }

  // Generate hints with increasing character lengths (2-char, then 3-char, etc.)
  generateHints(count: number) {
    const chars = this.hintChars;
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
  findJumpTargets(view: EditorView) {
    const doc = view.state.doc;
    const cursorPos = view.state.selection.main.head;
    const visibleRanges = view.visibleRanges;
    const targets = [];

    // Find all word boundaries in visible ranges
    for (let range of visibleRanges) {
      const text = doc.sliceString(range.from, range.to);

      // Find word boundaries only
      const wordRegex = /\b\w/g;
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

  activateJump(view: EditorView) {
    const targets = this.findJumpTargets(view);
    if (targets.length === 0) return false;

    const hints = this.generateHints(targets.length);
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

  handleJumpInput(view: EditorView, key: string) {
    const state = view.state.field(this.stateField);
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
    const newHints = new Map();
    matches.forEach(({ pos, hint }) => {
      newHints.set(pos, hint);
    });

    view.dispatch({
      effects: setJumpState.of({
        active: true,
        hints: newHints,
        currentInput: newInput,
      }),
    });

    return true;
  }

  createKeymap() {
    return keymap.of([
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
            this.activateJump(view);
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

      {
        key: "Enter",
        run: (view) => {
          const state = view.state.field(jumpState);
          if (state.active) {

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
            return true;
          }
          return false;
        },
      },
    ]);
  }

  getExtensions() {
    return [
      this.stateField,
      this.decorationPlugin,
      this.keymap,
      this.inputHandler,
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
}
