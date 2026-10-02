"use client";

import "./pager.css";

// Previous / page box / Go / Next, with "Page X of Y" above it on phones.
// The page box sits between Previous and Next and takes a typed page number
// (Enter or Go jumps to it). Parent owns `pageInput` so it can reset it when
// the server clamps the page.
export default function Pager({
  position,
  page,
  totalPages,
  totalMatching,
  noun,
  pageInput,
  setPageInput,
  goToPage,
  disabled,
}: {
  position: "top" | "bottom";
  page: number;
  totalPages: number;
  totalMatching: number;
  noun: string;
  pageInput: string;
  setPageInput: (v: string) => void;
  goToPage: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div className={`pager pager--${position}`}>
      <span className="panel-desc pager-info">
        Page {page} of {totalPages} • {totalMatching} {noun}
        {totalMatching === 1 ? "" : "s"}
      </span>
      <div className="pager-controls">
        <button className="btn btn-ghost pager-btn" disabled={disabled || page <= 1} onClick={() => goToPage(page - 1)}>
          Previous
        </button>
        <input
          className="input pager-input"
          type="number"
          inputMode="numeric"
          enterKeyHint="go"
          min={1}
          max={totalPages}
          value={pageInput}
          aria-label={`Go to page (${position})`}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") goToPage(parseInt(pageInput, 10));
          }}
        />
        <button className="btn btn-ghost pager-btn" disabled={disabled} onClick={() => goToPage(parseInt(pageInput, 10))}>
          Go
        </button>
        <button className="btn btn-ghost pager-btn" disabled={disabled || page >= totalPages} onClick={() => goToPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
