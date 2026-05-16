"use client";

import { useCallback, useEffect, useRef } from "react";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { createCursorExtension, updateCursors } from "@/components/game/panels/CursorOverlay";
import type { CursorPresence } from "@/types";

type CodeEditorProps = {
  value: string;
  language: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onCursorActivity?: (anchor: number, head: number) => void;
  remoteCursors?: CursorPresence[];
};

function getLanguageExtension(language: string) {
  switch (language.toLowerCase()) {
    case "javascript":
    case "js":
    case "typescript":
    case "ts":
      return javascript({ typescript: language.toLowerCase().startsWith("t") });
    case "python":
    case "py":
      return python();
    default:
      return javascript();
  }
}

export function CodeEditor({ value, language, disabled, onChange, onCursorActivity, remoteCursors }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorActivityRef = useRef(onCursorActivity);
  const isExternalUpdate = useRef(false);
  const valueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onCursorActivityRef.current = onCursorActivity;
  }, [onCursorActivity]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const createEditor = useCallback(() => {
    if (!containerRef.current) {
      return;
    }

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const initialValue = valueRef.current;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate.current) {
        const newValue = update.state.doc.toString();
        onChangeRef.current?.(newValue);
      }
      if (update.selectionSet && !isExternalUpdate.current) {
        const { anchor, head } = update.state.selection.main;
        onCursorActivityRef.current?.(anchor, head);
      }
    });

    const editable = EditorView.editable.of(!disabled);

    const customTheme = EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "13px",
        fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
      },
      ".cm-content": {
        padding: "12px 0",
        caretColor: "#a2e858",
      },
      "&.cm-focused .cm-cursor, .cm-cursor": {
        borderLeftColor: "#a2e858",
        borderLeftWidth: "2px",
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(162, 232, 88, 0.06)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "rgba(162, 232, 88, 0.12)",
      },
      ".cm-gutters": {
        backgroundColor: "#1a1b2e",
        color: "#555c80",
        border: "none",
        borderRight: "1px solid #2f3049",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 8px 0 12px",
        minWidth: "36px",
        fontSize: "11px",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: "rgba(162, 232, 88, 0.18) !important",
      },
      ".cm-scroller": {
        overflow: "auto",
      },
    });

    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        getLanguageExtension(language),
        oneDark,
        customTheme,
        editable,
        updateListener,
        createCursorExtension(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
        EditorView.lineWrapping,
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });
  }, [language, disabled]);

  useEffect(() => {
    createEditor();

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [createEditor]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const currentContent = view.state.doc.toString();
    if (currentContent === value) {
      return;
    }

    isExternalUpdate.current = true;
    const nextLength = value.length;
    const selection = EditorSelection.create(
      view.state.selection.ranges.map((range) =>
        EditorSelection.range(
          Math.min(range.anchor, nextLength),
          Math.min(range.head, nextLength),
        ),
      ),
      view.state.selection.mainIndex,
    );
    view.dispatch({
      changes: {
        from: 0,
        to: currentContent.length,
        insert: value,
      },
      selection,
    });
    isExternalUpdate.current = false;
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !remoteCursors) return;
    updateCursors(view, remoteCursors);
  }, [remoteCursors]);

  return (
    <div
      ref={containerRef}
      className="code-editor-container"
      style={{ height: "100%" }}
    />
  );
}
