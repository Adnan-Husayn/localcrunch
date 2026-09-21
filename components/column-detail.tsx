import { ListFilter } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SeverityTag } from "@/components/severity-tag";
import { TypeBadge } from "@/components/type-badge";
import type { Finding } from "@/lib/insights";
import type { ColumnStats, SchemaColumn } from "@/lib/types";

const fmt = (n: number, digits = 2) => n.toLocaleString(undefined, { maximumFractionDigits: digits });

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`rounded-lg border p-4 ${highlight ? "border-mark bg-accent-soft" : "border-line bg-surface"}`}>
            <div className="text-xs font-medium text-muted">{label}</div>
            <div className="mt-1 font-mono text-xl font-semibold text-ink">{value}</div>
        </div>
    );
}

function NumericView({ stats }: { stats: ColumnStats }) {
    if (stats.numeric_count === 0) {
        return (
            <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-muted">
                No numeric values in these rows.
            </p>
        );
    }

    const stdDev = stats.numeric_count > 1 ? Math.sqrt(stats.m2 / (stats.numeric_count - 1)) : 0;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Minimum" value={fmt(stats.min)} />
                <StatCard label="Median" value={fmt(stats.median)} highlight />
                <StatCard label="Mean" value={fmt(stats.mean)} highlight />
                <StatCard label="Maximum" value={fmt(stats.max)} />
                <StatCard label="25th percentile" value={fmt(stats.q1)} />
                <StatCard label="75th percentile" value={fmt(stats.q3)} />
                <StatCard label="Std deviation" value={fmt(stdDev)} />
                <StatCard label="Outliers" value={stats.outlier_pct > 0 ? `~${fmt(stats.outlier_pct, 1)}%` : "None"} />
            </div>

            {stats.histogram.length > 0 && (
                <div>
                    <h4 className="mb-3 text-sm font-semibold text-ink">Distribution</h4>
                    <div className="h-72 rounded-lg border border-line bg-surface p-4">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <BarChart data={stats.histogram} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
                                <XAxis
                                    dataKey="range_start"
                                    tickFormatter={(v: number) => fmt(v, 1)}
                                    interval="preserveStartEnd"
                                    minTickGap={32}
                                    tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                                    axisLine={{ stroke: "var(--color-line)" }}
                                    tickLine={false}
                                />
                                <YAxis hide />
                                <Tooltip
                                    cursor={{ fill: "var(--color-sunken)" }}
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        const bin = payload[0].payload;
                                        return (
                                            <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-sm">
                                                <div className="font-mono text-muted">
                                                    {fmt(bin.range_start, 1)} – {fmt(bin.range_end, 1)}
                                                </div>
                                                <div className="mt-1 font-semibold text-ink">
                                                    {bin.count.toLocaleString()} <span className="font-normal text-muted">in sample</span>
                                                </div>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="count" fill="var(--color-accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="mt-2 text-xs text-faint">Built from a 2,000-value random sample, so shapes are accurate but counts are relative.</p>
                </div>
            )}
        </div>
    );
}

interface CategoricalViewProps {
    stats: ColumnStats;
    canFilter: boolean;
    onFilterValue: (value: string) => void;
}

function CategoricalView({ stats, canFilter, onFilterValue }: CategoricalViewProps) {
    const present = stats.total_count - stats.null_count;

    return (
        <div className="space-y-6">
            <div className="rounded-lg border border-line bg-surface p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs font-medium text-muted">Distinct values</div>
                        <div className="mt-1 font-mono text-2xl font-semibold text-ink">
                            {stats.is_high_cardinality ? `${stats.unique_count_approx.toLocaleString()}+` : stats.unique_count_approx.toLocaleString()}
                        </div>
                    </div>
                    {stats.is_high_cardinality && (
                        <span className="rounded-md border border-mark bg-accent-soft px-2 py-1 text-xs font-medium text-ink">
                            High cardinality
                        </span>
                    )}
                </div>
                {stats.is_high_cardinality && (
                    <p className="mt-3 text-xs text-muted">
                        Too many distinct values to count exactly. To keep memory bounded, only the first {stats.unique_count_approx.toLocaleString()} values seen are tracked, so the counts below are a lower bound.
                    </p>
                )}
            </div>

            {stats.top_categories.length > 0 ? (
                <div>
                    <h4 className="mb-3 text-sm font-semibold text-ink">Most common values</h4>
                    <ul className="space-y-2">
                        {stats.top_categories.map((cat) => {
                            const pct = present > 0 ? (cat.value / present) * 100 : 0;
                            return (
                                <li key={cat.name} className="relative overflow-hidden rounded-lg border border-line bg-surface px-4 py-2.5">
                                    <div className="absolute inset-y-0 left-0 bg-accent-soft transition-all duration-300" style={{ width: `${pct}%` }} />
                                    <div className="relative flex items-center justify-between gap-4">
                                        <span className="truncate text-sm font-medium text-ink" title={cat.name}>
                                            {cat.name || "(empty)"}
                                        </span>
                                        <span className="flex shrink-0 items-center gap-3">
                                            <span className="flex items-baseline gap-2 font-mono text-sm">
                                                <span className="font-semibold text-ink">{cat.value.toLocaleString()}</span>
                                                <span className="w-12 text-right text-xs text-muted">{pct.toFixed(1)}%</span>
                                            </span>
                                            <button
                                                onClick={() => onFilterValue(cat.name)}
                                                disabled={!canFilter}
                                                title={canFilter ? "Re-run the analysis on only the rows with this value" : "Wait for the analysis to finish"}
                                                className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2 py-1 text-xs font-medium text-ink transition-colors hover:border-accent/60 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                <ListFilter className="h-3 w-3" /> Only this
                                            </button>
                                        </span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : (
                <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-muted">
                    No values to summarize yet.
                </p>
            )}
        </div>
    );
}

function FindingsCallout({ findings }: { findings: Finding[] }) {
    if (findings.length === 0) return null;
    return (
        <ul className="space-y-2">
            {findings.map((f, i) => (
                <li
                    key={i}
                    className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
                        f.severity === "warning" ? "border-mark bg-accent-soft text-ink" : "border-line bg-surface text-muted"
                    }`}
                >
                    <SeverityTag severity={f.severity} />
                    <span>
                        <span className="font-medium text-ink">{f.title}. </span>
                        {f.detail}
                    </span>
                </li>
            ))}
        </ul>
    );
}

interface ColumnDetailProps {
    column: SchemaColumn;
    stats: ColumnStats;
    findings: Finding[];
    canFilter: boolean;
    onFilterValue: (value: string) => void;
}

export function ColumnDetail({ column, stats, findings, canFilter, onFilterValue }: ColumnDetailProps) {
    const present = stats.total_count - stats.null_count;
    const isNumeric = column.col_type === "Integer" || column.col_type === "Float";

    return (
        <div className="fade-in space-y-6">
            <div className="border-b border-line pb-4">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold tracking-tight text-ink">{column.name}</h2>
                    <TypeBadge type={column.col_type} />
                </div>
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                    <div className="flex gap-1.5"><dt>Rows</dt><dd className="font-mono text-ink">{stats.total_count.toLocaleString()}</dd></div>
                    <div className="flex gap-1.5"><dt>Filled</dt><dd className="font-mono text-good">{present.toLocaleString()}</dd></div>
                    <div className="flex gap-1.5"><dt>Missing</dt><dd className={`font-mono ${stats.null_count > 0 ? "text-bad" : "text-ink"}`}>{stats.null_count.toLocaleString()}</dd></div>
                </dl>
            </div>

            <FindingsCallout findings={findings} />

            {isNumeric ? (
                <NumericView stats={stats} />
            ) : (
                <CategoricalView stats={stats} canFilter={canFilter} onFilterValue={onFilterValue} />
            )}
        </div>
    );
}
