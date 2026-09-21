import { SeverityTag } from "@/components/severity-tag";
import { TypeBadge } from "@/components/type-badge";

// Real output from running the built-in sample dataset (sample_orders.csv,
// 50,068 rows). Kept as static data so the landing page ships no JavaScript.
const FINDINGS = [
    { level: "WARN", column: null, title: "Duplicate rows", detail: <><mark className="mark">68 rows</mark> (0.14%) are exact copies of an earlier row.</> },
    { level: "WARN", column: "unit_price", title: "Values that aren't numbers", detail: <><mark className="mark">37 values</mark> can&apos;t be read as numbers, though the column looks numeric.</> },
    { level: "NOTE", column: "region", title: "Possible placeholder", detail: <>&quot;N/A&quot; appears <mark className="mark">300 times</mark> and may stand for a missing value.</> },
    { level: "NOTE", column: "rating", title: "Missing values", detail: <><mark className="mark">35%</mark> of values are missing (17,710 rows).</> },
] as const;

const STATS = [
    ["MEDIAN", "44.29"],
    ["MEAN", "72.86"],
    ["MAX", "823.74"],
] as const;

// unit_price histogram, bar heights relative to the tallest bin.
const BARS = [100, 52, 14, 12, 7, 6, 4, 1, 1, 1, 1, 0, 0, 0, 0, 0];

export function PreviewMock() {
    return (
        <figure className="w-full">
            <div className="border border-ink bg-surface">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-ink px-4 py-2.5 font-mono text-xs">
                    <span className="font-medium">sample_orders.csv</span>
                    <span className="text-muted">50,068 rows · 12 columns</span>
                </div>

                <div className="px-4 pt-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted">
                    6 findings, 2 need a look
                </div>
                <ul className="px-4 pb-1">
                    {FINDINGS.map((f) => (
                        <li key={f.title} className="grid grid-cols-[3rem_1fr] gap-x-3 border-b border-line py-3 last:border-b-0">
                            <SeverityTag severity={f.level === "WARN" ? "warning" : "info"} />
                            <span className="min-w-0 text-sm">
                                <span className="block font-medium">
                                    {f.column && <span className="font-mono text-[13px]">{f.column}</span>}
                                    {f.column && <span className="text-faint"> / </span>}
                                    {f.title}
                                </span>
                                <span className="block leading-snug text-muted">{f.detail}</span>
                            </span>
                        </li>
                    ))}
                </ul>

                <div className="border-t border-ink px-4 py-4">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">unit_price</span>
                        <TypeBadge type="Float" />
                    </div>
                    <dl className="mt-3 grid grid-cols-3 border-y border-line">
                        {STATS.map(([label, value], i) => (
                            <div key={label} className={`py-2 ${i > 0 ? "border-l border-line pl-3" : ""}`}>
                                <dt className="font-mono text-[10px] tracking-wider text-muted">{label}</dt>
                                <dd className="font-mono text-lg font-medium">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <div
                        className="mt-4 flex h-24 items-end gap-[3px] border-b border-ink"
                        role="img"
                        aria-label="Histogram of unit_price, heavily right-skewed"
                    >
                        {BARS.map((h, i) => (
                            <div key={i} className="flex-1 bg-ink" style={{ height: `${h === 0 ? 0 : Math.max(h, 3)}%` }} />
                        ))}
                    </div>
                </div>
            </div>
            <figcaption className="mt-2 font-mono text-[11px] text-muted">
                Fig. 1. Actual output on the built-in sample data (4 of 6 findings shown).
            </figcaption>
        </figure>
    );
}
