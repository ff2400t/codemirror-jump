import {
  Compartment,
  EditorSelection,
  type Extension,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  KeyBinding,
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
  hints: Array<{ pos: number; hint: string }>;
  currentInput: string;
};

// State effects for managing jump state
const setJumpState = StateEffect.define<JumpStateField | null>();
const clearJumpState = StateEffect.define();

// State field to track jump state
export const jumpState = StateField.define<JumpStateField>({
  create() {
    return { active: false, hints: [], currentInput: "" };
  },

  update(value, tr) {
    for (let effect of tr.effects) {
      if (effect.is(setJumpState)) {
        return effect.value!;
      }
      if (effect.is(clearJumpState)) {
        return {
          active: false,
          hints: [],
          currentInput: "",
        };
      }
    }
    return value;
  },
});

interface JumpExtOptions {
  triggerKey: string;
  hintChars: string;
}

export default class JumpExt {
  hintChars: string;
  stateField: StateField<JumpStateField>;
  decorationPlugin: ViewPlugin<any, undefined>;
  inputHandler: Extension;
  keymap: Extension;
  triggerKey: string | undefined;
  keymapCompartment: Compartment;

  constructor(
    options: JumpExtOptions,
  ) {
    this.hintChars = options?.hintChars || "abcdefghijklmnopqrstuvwxyz";
    this.triggerKey = options?.triggerKey ?? "Ctrl-;";
    this.stateField = jumpState;
    this.decorationPlugin = this.createDecorationPlugin();
    this.inputHandler = this.createInputHandler();

    this.keymapCompartment = new Compartment();
    this.keymap = this.createKeymap(this!.triggerKey);
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

          const decorations = state.hints.map(({ pos, hint }) =>
            Decoration.widget({
              widget: new HintWidget(hint),
              side: 0,
            }).range(pos)
          );

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

  handleJumpInput(view: EditorView, key: string) {
    const state = view.state.field(this.stateField);
    if (!state.active) return false;

    const newInput = state.currentInput + key;

    // Find matching hints
    const matches = state.hints.filter((a) => a.hint.startsWith(newInput));

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

    view.dispatch({
      effects: setJumpState.of({
        active: true,
        hints: matches,
        currentInput: newInput,
      }),
    });

    return true;
  }

  createKeymap(triggerKey: string | undefined) {
    const arr: KeyBinding[] = [
      {
        key: "Escape",
        run: (view: EditorView) => {
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
      // Enter key is used to match early. So if there are two hints like aa and aaa
      // The user can click enter after matching aa to jump there
      // this is the key that requires the higher precedence
      {
        key: "Enter",
        run: (view: EditorView) => {
          const state = view.state.field(jumpState);
          if (state.active) {
            for (let { pos, hint } of state.hints) {
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
    ];

    if (triggerKey != "" || triggerKey != undefined) {
      arr.unshift({
        key: triggerKey,
        run: (view) => {
          const state = view.state.field(jumpState);
          if (state.active) {
            // If already active, clear it
            view.dispatch({
              effects: clearJumpState.of(null),
            });
          } else {
            // Activate jump
            activateJump(view, this.hintChars);
          }
          return true;
        },
      });
    }

    return keymap.of(arr);
  }

  // Method to reconfigure the trigger key at runtime
  reconfigureTriggerKey(view: EditorView, newTriggerKey: string) {
    this.triggerKey = newTriggerKey;
    view.dispatch({
      effects: this.keymapCompartment.reconfigure(
        this.createKeymap(newTriggerKey),
      ),
    });
  }

  getExtensions() {
    return [
      this.stateField,
      this.decorationPlugin,
      // this needs to be of High precedence so that the enter key input works in the keymap
      Prec.high(this.keymapCompartment.of(this.createKeymap(this.triggerKey))),
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

function activateJump(view: EditorView, chars: string) {
  const targets = findJumpTargets(view);
  if (targets.length === 0) return false;

  const hints = generateHints(chars, targets.length);

  const hints_arr = targets.map((pos, i) => ({ pos, hint: hints[i] }));

  view.dispatch({
    effects: setJumpState.of({
      active: true,
      hints: hints_arr,
      currentInput: "",
    }),
  });

  return true;
}
// Find all word boundaries and other jump targets
function findJumpTargets(view: EditorView): number[] {
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

// Generate hints with increasing character lengths (2-char, then 3-char, etc.)
function generateHints(chars: string, count: number): string[] {
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
