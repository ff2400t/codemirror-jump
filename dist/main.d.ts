import { Compartment, type Extension, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
type JumpStateField = {
    active: boolean;
    hints: Array<{
        pos: number;
        hint: string;
    }>;
    currentInput: string;
};
export declare const jumpState: StateField<JumpStateField>;
interface JumpExtOptions {
    triggerKey: string | undefined;
    hintChars: string | undefined;
}
export default class JumpExt {
    hintChars: string;
    stateField: StateField<JumpStateField>;
    decorationPlugin: ViewPlugin<any, undefined>;
    inputHandler: Extension;
    keymap: Extension;
    triggerKey: string;
    keymapCompartment: Compartment;
    constructor(options?: JumpExtOptions);
    createDecorationPlugin(): ViewPlugin<{
        decorations: any;
        update(update: ViewUpdate): void;
    }, undefined>;
    createInputHandler(): Extension;
    generateHints(count: number): string[];
    findJumpTargets(view: EditorView): number[];
    activateJump(view: EditorView): boolean;
    handleJumpInput(view: EditorView, key: string): boolean;
    createKeymap(triggerKey: string): Extension;
    reconfigureTriggerKey(view: EditorView, newTriggerKey: string): void;
    getExtensions(): (StateField<JumpStateField> | Extension)[];
}
export {};
