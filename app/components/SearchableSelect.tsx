"use client";

import { useEffect, useRef, useState } from "react";

export interface SelectOption {
  id: string;
  label: string;
  /** Shown smaller/muted under the label, e.g. a department's parent faculty. */
  sublabel?: string;
}

/**
 * A searchable, strictly-constrained select — the "country picker" pattern:
 * type to filter a fixed list, but the value can only ever become one of
 * the actual options. Free text alone is never accepted — closing the
 * dropdown without picking a match reverts the visible text to whatever
 * was last actually selected, so `value` can never point at something
 * that isn't in `options`.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
  disabled = false,
}: {
  options: SelectOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const selected = options.find((o) => o.id === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync if the selection changes from outside
  // (e.g. the parent resets it after a save).
  useEffect(() => {
    setQuery(selected?.label ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Typed something that was never actually picked — snap back to
        // the real selection rather than leaving stray free text visible.
        setQuery(selected?.label ?? "");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selected]);

  const filtered =
    query.trim().length === 0
      ? options
      : options.filter(
          (o) =>
            o.label.toLowerCase().includes(query.trim().toLowerCase()) ||
            o.sublabel?.toLowerCase().includes(query.trim().toLowerCase())
        );

  function pick(o: SelectOption) {
    onChange(o.id);
    setQuery(o.label);
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Typing invalidates the previous pick until a new option is
          // clicked — this is what makes free text unable to "stick."
          if (value !== null) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{
          display: "block",
          width: "100%",
          padding: "0.6rem 0.75rem",
          borderRadius: "8px",
          border: "1px solid var(--border-blue)",
          background: "var(--surface)",
          color: "var(--text-primary)",
        }}
      />
      {open && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 0.3rem)",
            left: 0,
            right: 0,
            maxHeight: 220,
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border-blue)",
            borderRadius: "8px",
            zIndex: 20,
            boxShadow: "0 8px 20px -8px rgba(0,20,40,0.18)",
          }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: "0.6rem 0.8rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              No matches — pick from the list, free text isn't accepted.
            </div>
          )}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "0.55rem 0.8rem",
                background: o.id === value ? "var(--bg-info)" : "none",
                border: "none",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              {o.label}
              {o.sublabel && (
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{o.sublabel}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
