import { Plus, X } from "lucide-react";
import type { Filter, SchemaColumn } from "@/lib/types";

interface FilterPanelProps {
    columns: SchemaColumn[];
    filters: Filter[];
    onChange: (filters: Filter[]) => void;
}

const OPERATORS: [string, string][] = [
    ["contains", "contains"],
    ["==", "equals"],
    ["!=", "not equals"],
    [">", ">"],
    [">=", "≥"],
    ["<", "<"],
    ["<=", "≤"],
];

const FIELD =
    "rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function FilterPanel({ columns, filters, onChange }: FilterPanelProps) {
    const update = (idx: number, patch: Partial<Filter>) =>
        onChange(filters.map((f, i) => (i === idx ? { ...f, ...patch } : f)));

    return (
        <section className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-ink">Filters</h3>
                    <p className="text-xs text-muted">
                        {filters.length === 0
                            ? "No filters. The whole file will be analyzed."
                            : "Only rows matching every filter are analyzed."}
                    </p>
                </div>
                <button
                    onClick={() => onChange([...filters, { col_index: 0, operator: "contains", value: "" }])}
                    className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sunken"
                >
                    <Plus className="h-3.5 w-3.5" /> Add filter
                </button>
            </div>

            {filters.length > 0 && (
                <div className="mt-3 space-y-2">
                    {filters.map((filter, idx) => (
                        <div key={idx} className="flex flex-wrap items-center gap-2">
                            <select
                                aria-label="Column"
                                className={`${FIELD} w-36`}
                                value={filter.col_index}
                                onChange={(e) => update(idx, { col_index: Number(e.target.value) })}
                            >
                                {columns.map((col, i) => (
                                    <option key={i} value={i}>{col.name}</option>
                                ))}
                            </select>

                            <select
                                aria-label="Operator"
                                className={`${FIELD} w-28`}
                                value={filter.operator}
                                onChange={(e) => update(idx, { operator: e.target.value })}
                            >
                                {OPERATORS.map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>

                            <input
                                type="text"
                                aria-label="Value"
                                className={`${FIELD} min-w-32 flex-1`}
                                placeholder="Value"
                                value={filter.value}
                                onChange={(e) => update(idx, { value: e.target.value })}
                            />

                            <button
                                aria-label="Remove filter"
                                onClick={() => onChange(filters.filter((_, i) => i !== idx))}
                                className="rounded-md p-1.5 text-faint transition-colors hover:bg-sunken hover:text-bad"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
