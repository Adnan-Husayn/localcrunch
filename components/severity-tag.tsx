import type { Severity } from "@/lib/insights";

// Warnings are filled ink, notes are outlined: readable in one glance and
// consistent with the type badges, with no traffic-light colours.
export function SeverityTag({ severity }: { severity: Severity }) {
    const isWarning = severity === "warning";
    return (
        <span
            className={`mt-0.5 h-fit w-fit shrink-0 rounded-sm px-1 py-0.5 font-mono text-[10px] font-medium leading-none tracking-wider ${
                isWarning ? "bg-ink text-canvas" : "border border-line-strong text-muted"
            }`}
        >
            {isWarning ? "WARN" : "NOTE"}
        </span>
    );
}
