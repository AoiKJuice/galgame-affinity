import { X } from "@phosphor-icons/react";

export function RatingControl({ value, onChange, label = "评分" }: { value: number | null; onChange: (value: number | null) => void; label?: string }) {
  return (
    <div className="rating-control">
      <label className="sr-only" htmlFor={`rating-${label}`}>{label}</label>
      <input
        id={`rating-${label}`}
        className="rating-number"
        type="number"
        inputMode="numeric"
        min="1"
        max="10"
        step="1"
        value={value ?? ""}
        placeholder="-"
        onChange={(event) => {
          const parsed = Number(event.target.value);
          onChange(event.target.value === "" || Number.isNaN(parsed) ? null : Math.round(Math.min(10, Math.max(1, parsed))));
        }}
      />
      <span className="rating-denominator">/10</span>
      <input
        aria-label={`${label}评分滑条`}
        className="rating-slider"
        type="range"
        min="1"
        max="10"
        step="1"
        value={value ?? 1}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <button className="icon-button compact" type="button" aria-label="清除评分" onClick={() => onChange(null)} disabled={value === null}>
        <X weight="bold" />
      </button>
    </div>
  );
}
