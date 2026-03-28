"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, Check, Pencil, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeEditorProps {
  /** The source code to display / edit. */
  code: string;
  /** Display name shown in the header bar (e.g. "agent.ts"). */
  filename?: string;
  /** Language badge shown in the header (default: "typescript"). */
  language?: string;
  /** When true, an Edit button is shown and the user can modify the code. */
  editable?: boolean;
  /** Called when the user clicks "Save changes". */
  onSave?: (newCode: string) => void;
  className?: string;
}

/**
 * GitHub-style code viewer / editor.
 *
 * View mode  → syntax-styled <pre> with line numbers, Copy + (optional) Edit buttons.
 * Edit mode  → scrollable <textarea> with synced line numbers, Save + Cancel footer.
 */
export function CodeEditor({
  code,
  filename = "agent.ts",
  language = "typescript",
  editable = false,
  onSave,
  className,
}: CodeEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(code);
  const [copied, setCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Keep draft in sync when the parent supplies new code (e.g. after save).
  useEffect(() => {
    if (!isEditing) setDraft(code);
  }, [code, isEditing]);

  const displayCode = isEditing ? draft : code;
  const lineCount = displayCode.split("\n").length;

  /** Sync line-number scroll position to the textarea. */
  const syncScroll = () => {
    if (textareaRef.current && lineNumRef.current) {
      lineNumRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEdit = () => {
    setDraft(code);
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const cancel = () => {
    setDraft(code);
    setIsEditing(false);
  };

  const save = () => {
    onSave?.(draft);
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full rounded-lg overflow-hidden bg-[#0d1117] text-[#e6edf3]",
        className
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-[#8b949e] text-xs font-mono">{filename}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#21262d] border border-[#30363d] text-[#8b949e] uppercase tracking-widest">
            {language}
          </span>
        </div>

        <div className="flex gap-1.5">
          {editable && !isEditing && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border border-[#30363d] bg-[#21262d] hover:bg-[#292e36] hover:border-[#484f58] text-[#c9d1d9] transition-colors"
            >
              <Pencil size={11} />
              Edit
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border border-[#30363d] bg-[#21262d] hover:bg-[#292e36] hover:border-[#484f58] text-[#c9d1d9] transition-colors"
          >
            {copied ? (
              <>
                <Check size={11} className="text-green-400" />
                Copied
              </>
            ) : (
              <>
                <Copy size={11} />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Code area ── */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Line numbers — synced via scroll handler */}
        <div
          ref={lineNumRef}
          aria-hidden
          className="select-none shrink-0 overflow-hidden bg-[#0d1117] border-r border-[#21262d] text-[#484f58] text-right"
          style={{
            width: "52px",
            paddingTop: "16px",
            paddingBottom: "16px",
            paddingRight: "12px",
            fontSize: "12px",
            lineHeight: "24px",
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ lineHeight: "24px" }}>
              {i + 1}
            </div>
          ))}
        </div>

        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onScroll={syncScroll}
            className="flex-1 px-4 py-4 bg-[#0d1117] text-[#e6edf3] resize-none outline-none overflow-auto"
            style={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: "12px",
              lineHeight: "24px",
            }}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        ) : (
          <pre
            ref={preRef}
            className="flex-1 px-4 py-4 overflow-auto whitespace-pre text-[#e6edf3]"
            style={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: "12px",
              lineHeight: "24px",
            }}
          >
            <code>{code}</code>
          </pre>
        )}
      </div>

      {/* ── Footer / Status bar ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-t border-[#30363d] shrink-0">
        <span className="text-[10px] text-[#484f58] font-mono uppercase tracking-widest">
          {lineCount} lines · {language}
        </span>

        {isEditing ? (
          <div className="flex gap-1.5">
            <button
              onClick={cancel}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded border border-[#30363d] bg-[#21262d] hover:bg-[#292e36] text-[#8b949e] transition-colors"
            >
              <X size={10} />
              Cancel
            </button>
            <button
              onClick={save}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded bg-[#238636] hover:bg-[#2ea043] border border-[#238636] text-white transition-colors"
            >
              <Save size={10} />
              Save changes
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-[#484f58] font-mono">
            {editable ? "LangGraph ReAct · TypeScript" : "LangChain Tool · TypeScript"}
          </span>
        )}
      </div>
    </div>
  );
}
