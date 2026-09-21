import type { AnalysisResult, ColumnStats, Filter, SchemaColumn } from "@/lib/types";

export type Severity = "warning" | "info";

export interface Finding {
    severity: Severity;
    /** Index of the column the finding is about, or null for the whole dataset. */
    columnIndex: number | null;
    title: string;
    detail: string;
}

const PLACEHOLDERS = new Set(["n/a", "na", "null", "none", "nan", "-", "--", "missing", "unknown", "?", "undefined"]);

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const fmtPct = (n: number) => (n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2)) + "%";

function columnFindings(index: number, column: SchemaColumn, stats: ColumnStats, pinnedToOneValue: boolean): Finding[] {
    const findings: Finding[] = [];
    const rows = stats.total_count;
    if (rows === 0) return findings;

    const present = rows - stats.null_count;
    const isNumeric = column.col_type === "Integer" || column.col_type === "Float";
    const add = (severity: Severity, title: string, detail: string) =>
        findings.push({ severity, columnIndex: index, title, detail });

    const missing = pct(stats.null_count, rows);
    if (missing >= 50) {
        add("warning", "Mostly empty", `${fmtPct(missing)} of values are missing (${stats.null_count.toLocaleString()} of ${rows.toLocaleString()} rows).`);
    } else if (missing >= 5) {
        add("info", "Missing values", `${fmtPct(missing)} of values are missing (${stats.null_count.toLocaleString()} rows).`);
    }

    if (isNumeric) {
        const invalid = present - stats.numeric_count;
        if (invalid > 0) {
            add("warning", "Values that aren't numbers", `${invalid.toLocaleString()} values can't be read as numbers even though the column looks numeric. Statistics ignore them.`);
        }
        if (stats.outlier_pct >= 3) {
            add("info", "Outliers", `About ${fmtPct(stats.outlier_pct)} of values fall outside the 1.5×IQR fences (estimated from a 2,000-value sample).`);
        }
    } else {
        const placeholder = stats.top_categories.find((c) => PLACEHOLDERS.has(c.name.trim().toLowerCase()));
        if (placeholder) {
            add("info", "Possible placeholder", `"${placeholder.name}" appears ${placeholder.value.toLocaleString()} times and may stand for a missing value.`);
        }
    }

    if (present > 0 && !stats.is_high_cardinality) {
        if (stats.unique_count_approx === 1) {
            // Filtering a column down to one value makes it constant by construction.
            if (pinnedToOneValue) return findings;
            add("info", "Constant column", "Every filled value is the same, so this column carries no information.");
        } else if (present >= 50 && stats.unique_count_approx === present) {
            add("info", "All values unique", "Likely an identifier rather than something to analyze.");
        }
    }

    return findings;
}

/** Data-quality findings, warnings first, then in column order. */
export function buildFindings(columns: SchemaColumn[], analysis: AnalysisResult, filters: Filter[] = []): Finding[] {
    const findings: Finding[] = [];

    if (analysis.duplicate_rows > 0) {
        const share = pct(analysis.duplicate_rows, analysis.rows_processed);
        findings.push({
            severity: "warning",
            columnIndex: null,
            title: "Duplicate rows",
            detail:
                analysis.duplicate_rows === 1 && !analysis.duplicates_capped
                    ? `1 row (${fmtPct(share)}) is an exact copy of an earlier row.`
                    : `${analysis.duplicates_capped ? "At least " : ""}${analysis.duplicate_rows.toLocaleString()} rows (${fmtPct(share)}) are exact copies of an earlier row.`,
        });
    }

    columns.forEach((column, i) => {
        const stats = analysis.columns[i];
        const pinned = filters.some((f) => f.col_index === i && f.operator === "==");
        if (stats) findings.push(...columnFindings(i, column, stats, pinned));
    });

    const rank = (f: Finding) => (f.severity === "warning" ? 0 : 1);
    return findings.sort((a, b) => rank(a) - rank(b));
}
