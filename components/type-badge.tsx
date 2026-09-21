import type { ColType } from "@/lib/types";

const LABELS: Record<ColType, string> = {
    Integer: "INT",
    Float: "DEC",
    String: "TEXT",
    Date: "DATE",
    Boolean: "BOOL",
    Null: "EMPTY",
};

// Numeric columns are filled, everything else is outlined, so the two kinds
// are easy to tell apart at a glance without a rainbow of colours.
const FILLED = new Set<ColType>(["Integer", "Float"]);

export function TypeBadge({ type }: { type: ColType }) {
    return (
        <span
            className={`inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none tracking-wider ${
                FILLED.has(type) ? "bg-ink text-canvas" : "border border-line-strong text-muted"
            }`}
        >
            {LABELS[type] ?? type}
        </span>
    );
}
