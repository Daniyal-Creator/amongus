import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createCursorExtension, updateCursors } from "@/components/game/panels/CursorOverlay";

describe("CursorOverlay", () => {
  it("renders a colored caret and player label at the remote cursor position", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const view = new EditorView({
      state: EditorState.create({
        doc: "const suspect = true;",
        extensions: [createCursorExtension()],
      }),
      parent,
    });

    updateCursors(view, [
      {
        playerId: "blue-player",
        name: "Blue",
        color: "#2f7dff",
        anchor: 6,
        head: 6,
      },
    ]);

    const caret = parent.querySelector<HTMLElement>(".cm-remoteCursor");
    const label = parent.querySelector<HTMLElement>(".cm-remoteCursorLabel");

    expect(caret).toBeInTheDocument();
    expect(caret).toHaveStyle({ borderLeftColor: "#2f7dff" });
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent("Blue");
    expect(label).toHaveStyle({ backgroundColor: "#2f7dff" });

    view.destroy();
    parent.remove();
  });
});
