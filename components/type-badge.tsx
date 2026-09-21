import { Calendar, CheckSquare, Hash, Type } from "lucide-react";
import type { ColType } from "@/lib/types";

const STYLES: Record<ColType, string> = {
    Integer: "bg-blue-50 text-blue-700 border-blue-200",
    Float: "bg-sky-50 text-sky-700 border-sky-200",
    String: "bg-sunken text-muted border-line",
    Date: "bg-violet-50 text-violet-700 border-violet-200",
    Boolean: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Null: "bg-sunken text-faint border-line",
};

const LABELS: Record<ColType, string> = {
    Integer: "INT",
    Float: "DEC",
    String: "TEXT",
    Date: "DATE",
    Boolean: "BOOL",
    Null: "EMPTY",
};

const ICONS: Record<ColType, React.ReactNode> = {
    Integer: <Hash className="h-3 w-3" />,
    Float: <Hash className="h-3 w-3" />,
    String: <Type className="h-3 w-3" />,
    Date: <Calendar className="h-3 w-3" />,
    Boolean: <CheckSquare className="h-3 w-3" />,
    Null: null,
};

export function TypeBadge({ type }: { type: ColType }) {
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${STYLES[type] ?? STYLES.Null}`}
        >
            {ICONS[type]}
            {LABELS[type] ?? type}
        </span>
    );
}
