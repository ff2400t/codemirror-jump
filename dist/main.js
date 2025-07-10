var x = Object.defineProperty;
var k = (i, e, t) => e in i ? x(i, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : i[e] = t;
var c = (i, e, t) => k(i, typeof e != "symbol" ? e + "" : e, t);
import { StateEffect as y, StateField as C, Compartment as I, EditorSelection as m, Prec as b } from "@codemirror/state";
import { ViewPlugin as E, Decoration as l, EditorView as g, keymap as F, WidgetType as S } from "@codemirror/view";
class H extends S {
  constructor(t) {
    super();
    c(this, "hint");
    this.hint = t;
  }
  toDOM() {
    const t = document.createElement("span");
    return t.textContent = this.hint, t.classList.add("cm-jump-hint"), t;
  }
}
const f = y.define(), o = y.define(), h = C.define({
  create() {
    return { active: !1, hints: [], currentInput: "" };
  },
  update(i, e) {
    for (let t of e.effects) {
      if (t.is(f))
        return t.value;
      if (t.is(o))
        return {
          active: !1,
          hints: [],
          currentInput: ""
        };
    }
    return i;
  }
});
class R {
  constructor(e) {
    c(this, "hintChars");
    c(this, "stateField");
    c(this, "decorationPlugin");
    c(this, "inputHandler");
    c(this, "keymap");
    c(this, "triggerKey");
    c(this, "keymapCompartment");
    this.hintChars = (e == null ? void 0 : e.hintChars) || "abcdefghijklmnopqrstuvwxyz", this.triggerKey = (e == null ? void 0 : e.triggerKey) ?? "Ctrl-;", this.stateField = h, this.decorationPlugin = this.createDecorationPlugin(), this.inputHandler = this.createInputHandler(), this.keymapCompartment = new I(), this.keymap = this.createKeymap(this.triggerKey);
  }
  createDecorationPlugin() {
    const e = this.stateField;
    return E.fromClass(
      class {
        constructor(t) {
          c(this, "decorations");
          this.decorations = l.none, this.update(t);
        }
        update(t) {
          const n = t.state.field(e);
          if (!n.active) {
            this.decorations = l.none;
            return;
          }
          const s = n.hints.map(
            ({ pos: r, hint: a }) => l.widget({
              widget: new H(a),
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
    return g.domEventHandlers({
      keydown: (n, s) => s.state.field(e).active ? n.key.length === 1 && t.includes(n.key) ? (n.preventDefault(), this.handleJumpInput(s, n.key)) : n.key === "Escape" ? (n.preventDefault(), s.dispatch({
        effects: o.of(null)
      }), !0) : !1 : !1
    });
  }
  handleJumpInput(e, t) {
    const n = e.state.field(this.stateField);
    if (!n.active) return !1;
    const s = n.currentInput + t, r = n.hints.filter((a) => a.hint.startsWith(s));
    return r.length === 0 ? (e.dispatch({
      effects: o.of(null)
    }), !0) : r.length === 1 && r[0].hint === s ? (e.dispatch({
      selection: m.cursor(r[0].pos),
      effects: o.of(null),
      scrollIntoView: !0
    }), !0) : (e.dispatch({
      effects: f.of({
        active: !0,
        hints: r,
        currentInput: s
      })
    }), !0);
  }
  createKeymap(e) {
    const t = [
      {
        key: "Escape",
        run: (n) => n.state.field(h).active ? (n.dispatch({
          effects: o.of(null)
        }), !0) : !1
      },
      // Enter key is used to match early. So if there are two hints like aa and aaa
      // The user can click enter after matching aa to jump there
      // this is the key that requires the higher precedence
      {
        key: "Enter",
        run: (n) => {
          const s = n.state.field(h);
          if (s.active) {
            for (let { pos: r, hint: a } of s.hints)
              a == s.currentInput && n.dispatch({
                selection: m.cursor(r),
                effects: o.of(null),
                scrollIntoView: !0
              });
            return n.dispatch({
              effects: o.of(null)
            }), !0;
          }
          return !1;
        }
      }
    ];
    return (e != "" || e != null) && t.unshift({
      key: e,
      run: (n) => (n.state.field(h).active ? n.dispatch({
        effects: o.of(null)
      }) : K(n, this.hintChars), !0)
    }), F.of(t);
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
      b.high(this.keymapCompartment.of(this.createKeymap(this.triggerKey))),
      this.inputHandler,
      // Add some basic styling
      g.theme({
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
function K(i, e) {
  const t = P(i);
  if (t.length === 0) return !1;
  const n = J(e, t.length), s = t.map((r, a) => ({ pos: r, hint: n[a] }));
  return i.dispatch({
    effects: f.of({
      active: !0,
      hints: s,
      currentInput: ""
    })
  }), !0;
}
function P(i) {
  const e = i.state.doc, t = i.state.selection.main.head, n = i.visibleRanges, s = [];
  for (let r of n) {
    const a = e.sliceString(r.from, r.to), u = /\b\w/g;
    let d;
    for (; (d = u.exec(a)) !== null; ) {
      const p = r.from + d.index;
      p !== t && s.push(p);
    }
  }
  return [...new Set(s)].sort((r, a) => r - a);
}
function J(i, e) {
  const t = [];
  let n = 2;
  for (; t.length < e; ) {
    const s = (r, a = "") => {
      if (a.length === r) {
        t.push(a);
        return;
      }
      for (let u = 0; u < i.length && t.length < e; u++)
        s(r, a + i[u]);
    };
    s(n), n++;
  }
  return t.slice(0, e);
}
export {
  K as activateJump,
  R as default,
  h as jumpState
};
