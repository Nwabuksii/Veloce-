import BadgeShield from "@/app/components/BadgeShield";
import "./badges.css";

export interface SlotBadge {
  id: string;
  badgeKey: string;
  periodType: "ALL_TIME" | "SEMESTER" | "YEAR";
  periodKey: string;
}

// A fixed row of showcase slots. Filled slots show the badge; the rest are
// dim shadows so it is clear how many a scribe can still pin.
export default function BadgeSlots({ badges, max, onRemove, busyId }: { badges: SlotBadge[]; max: number; onRemove?: (b: SlotBadge) => void; busyId?: string | null }) {
  return (
    <div className="bs-slots" style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}>
      {Array.from({ length: max }, (_, i) => {
        const b = badges[i];
        return b ? (
          <div key={b.id} className="bs-slot is-filled">
            <BadgeShield badgeKey={b.badgeKey} periodType={b.periodType} periodKey={b.periodKey} size={84} />
            {onRemove && (
              <button type="button" className="bs-remove" disabled={busyId === b.id} onClick={() => onRemove(b)} aria-label="Remove from showcase">
                ×
              </button>
            )}
          </div>
        ) : (
          <div key={`empty-${i}`} className="bs-slot is-empty" aria-label="Empty badge slot">
            <svg viewBox="0 0 100 120" aria-hidden="true">
              <path d="M50 4 L92 20 V60 C92 88 74 106 50 116 C26 106 8 88 8 60 V20 Z" />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
