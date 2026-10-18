"use client";

export function PrintButton() {
  return (
    <button type="button" className="ws-print" onClick={() => window.print()}>
      Print this sign
    </button>
  );
}
