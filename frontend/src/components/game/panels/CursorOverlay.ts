import {
  EditorView,
  Decoration,
  type DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import type { CursorPresence } from "@/types";

const setCursorsEffect = StateEffect.define<CursorPresence[]>();

class CursorLabelWidget extends WidgetType {
  constructor(
    private name: string,
    private color: string,
  ) {
    super();
  }

  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-remoteCursor";
    el.style.borderLeftColor = this.color;
    el.style.color = this.color;

    const label = document.createElement("span");
    label.className = "cm-remoteCursorLabel";
    label.textContent = this.name;
    label.style.backgroundColor = this.color;
    label.style.color = "#fff";
    el.appendChild(label);

    return el;
  }

  eq(other: CursorLabelWidget) {
    return this.name === other.name && this.color === other.color;
  }
}

function buildDecorations(cursors: CursorPresence[], docLength: number): DecorationSet {
  if (cursors.length === 0 || docLength === 0) return Decoration.none;

  const ranges: ReturnType<Decoration["range"]>[] = [];

  for (const cursor of cursors) {
    const anchor = Math.max(0, Math.min(cursor.anchor, docLength));
    const pos = Math.max(0, Math.min(cursor.head, docLength));
    const selectionFrom = Math.min(anchor, pos);
    const selectionTo = Math.max(anchor, pos);

    if (selectionFrom < selectionTo) {
      ranges.push(
        Decoration.mark({
          class: "cm-remoteSelection",
          attributes: {
            style: `background-color: ${cursor.color}33`,
          },
        }).range(selectionFrom, selectionTo),
      );
    }

    ranges.push(
      Decoration.widget({
        widget: new CursorLabelWidget(cursor.name, cursor.color),
        side: 1,
      }).range(pos),
    );
  }

  ranges.sort((a, b) => a.from - b.from);

  try {
    return Decoration.set(ranges, true);
  } catch {
    return Decoration.none;
  }
}

const cursorField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCursorsEffect)) {
        return buildDecorations(effect.value, tr.state.doc.length);
      }
    }
    if (tr.docChanged) {
      return decorations.map(tr.changes);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function createCursorExtension() {
  return cursorField;
}

export function updateCursors(view: EditorView, cursors: CursorPresence[]) {
  view.dispatch({
    effects: setCursorsEffect.of(cursors),
  });
}
