var k = Object.defineProperty;
var C = (c, e, t) => e in c ? k(c, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : c[e] = t;
var a = (c, e, t) => C(c, typeof e != "symbol" ? e + "" : e, t);
import { StateEffect as x, StateField as I, Compartment as b, EditorSelection as m, Prec as E } from "@codemirror/state";
import { ViewPlugin as F, Decoration as l, EditorView as y, keymap as H, WidgetType as K } from "@codemirror/view";
class S extends K {
  constructor(t) {
    super();
    a(this, "hint");
    this.hint = t;
  }
  toDOM() {
    const t = document.createElement("span");
    return t.textContent = this.hint, t.classList.add("cm-jump-hint"), t;
  }
}
const d = x.define(), o = x.define(), f = I.define({
  create() {
    return { active: !1, hints: [], currentInput: "" };
  },
  update(c, e) {
    for (let t of e.effects) {
      if (t.is(d))
        return t.value;
      if (t.is(o))
        return {
          active: !1,
          hints: [],
          currentInput: ""
        };
    }
    return c;
  }
});
class j {
  constructor(e) {
    a(this, "hintChars");
    a(this, "stateField");
    a(this, "decorationPlugin");
    a(this, "inputHandler");
    a(this, "keymap");
    a(this, "triggerKey");
    a(this, "keymapCompartment");
    this.hintChars = (e == null ? void 0 : e.hintChars) || "abcdefghijklmnopqrstuvwxyz", this.triggerKey = (e == null ? void 0 : e.triggerKey) || "Ctrl-;", this.stateField = f, this.decorationPlugin = this.createDecorationPlugin(), this.inputHandler = this.createInputHandler(), this.keymapCompartment = new b(), this.keymap = this.createKeymap(this.triggerKey);
  }
  createDecorationPlugin() {
    const e = this.stateField;
    return F.fromClass(
      class {
        constructor(t) {
          a(this, "decorations");
          this.decorations = l.none, this.update(t);
        }
        update(t) {
          const n = t.state.field(e);
          if (!n.active) {
            this.decorations = l.none;
            return;
          }
          const s = n.hints.map(
            ({ pos: r, hint: i }) => l.widget({
              widget: new S(i),
              side: 0
            }).range(r)
          );
          this.decorations = l.set(s);
        }
      },
      {
        decorations: (t) => t.decorations
      }
    );
  }
  createInputHandler() {
    const e = this.stateField, t = this.hintChars;
    return y.domEventHandlers({
      keydown: (n, s) => s.state.field(e).active ? n.key.length === 1 && t.includes(n.key) ? (n.preventDefault(), this.handleJumpInput(s, n.key)) : n.key === "Escape" ? (n.preventDefault(), s.dispatch({
        effects: o.of(null)
      }), !0) : !1 : !1
    });
  }
  // Generate hints with increasing character lengths (2-char, then 3-char, etc.)
  generateHints(e) {
    const t = this.hintChars, n = [];
    let s = 2;
    for (; n.length < e; ) {
      const r = (i, u = "") => {
        if (u.length === i) {
          n.push(u);
          return;
        }
        for (let h = 0; h < t.length && n.length < e; h++)
          r(i, u + t[h]);
      };
      r(s), s++;
    }
    return n.slice(0, e);
  }
  // Find all word boundaries and other jump targets
  findJumpTargets(e) {
    const t = e.state.doc, n = e.state.selection.main.head, s = e.visibleRanges, r = [];
    for (let i of s) {
      const u = t.sliceString(i.from, i.to), h = /\b\w/g;
      let p;
      for (; (p = h.exec(u)) !== null; ) {
        const g = i.from + p.index;
        g !== n && r.push(g);
      }
    }
    return [...new Set(r)].sort((i, u) => i - u);
  }
  activateJump(e) {
    const t = this.findJumpTargets(e);
    if (t.length === 0) return !1;
    const n = this.generateHints(t.length), s = t.map((r, i) => ({ pos: r, hint: n[i] }));
    return e.dispatch({
      effects: d.of({
        active: !0,
        hints: s,
        currentInput: ""
      })
    }), !0;
  }
  handleJumpInput(e, t) {
    const n = e.state.field(this.stateField);
    if (!n.active) return !1;
    const s = n.currentInput + t, r = n.hints.filter((i) => i.hint.startsWith(s));
    return r.length === 0 ? (e.dispatch({
      effects: o.of(null)
    }), !0) : r.length === 1 && r[0].hint === s ? (e.dispatch({
      selection: m.cursor(r[0].pos),
      effects: o.of(null),
      scrollIntoView: !0
    }), !0) : (e.dispatch({
      effects: d.of({
        active: !0,
        hints: r,
        currentInput: s
      })
    }), !0);
  }
  createKeymap(e) {
    return H.of([
      {
        key: e,
        run: (t) => (t.state.field(f).active ? t.dispatch({
          effects: o.of(null)
        }) : this.activateJump(t), !0)
      },
      {
        key: "Escape",
        run: (t) => t.state.field(f).active ? (t.dispatch({
          effects: o.of(null)
        }), !0) : !1
      },
      // Enter key is used to match early. So if there are two hints like aa and aaa
      // The user can click enter after matching aa to jump there
      // this is the key that requires the higher precedence
      {
        key: "Enter",
        run: (t) => {
          const n = t.state.field(f);
          if (n.active) {
            for (let { pos: s, hint: r } of n.hints)
              r == n.currentInput && t.dispatch({
                selection: m.cursor(s),
                effects: o.of(null),
                scrollIntoView: !0
              });
            return t.dispatch({
              effects: o.of(null)
            }), !0;
          }
          return !1;
        }
      }
    ]);
  }
  // Method to reconfigure the trigger key at runtime
  reconfigureTriggerKey(e, t) {
    this.triggerKey = t, e.dispatch({
      effects: this.keymapCompartment.reconfigure(
        this.createKeymap(t)
      )
    });
  }
  getExtensions() {
    return [
      this.stateField,
      this.decorationPlugin,
      // this needs to be of High precedence so that the enter key input works in the keymap
      E.high(this.keymapCompartment.of(this.createKeymap(this.triggerKey))),
      this.inputHandler,
      // Add some basic styling
      y.theme({
        ".cm-jump-hint": {
          position: "absolute",
          background: "#ff6b6b",
          color: "white",
          fontWeight: "bold",
          fontSize: "12px",
          padding: "2px 4px",
          borderRadius: "3px",
          zIndex: 1e3,
          boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
          fontFamily: "monospace",
          lineHeight: 1,
          marginTop: "-2px",
          marginLeft: "-2px"
        }
      })
    ];
  }
}
export {
  j as default,
  f as jumpState
};
