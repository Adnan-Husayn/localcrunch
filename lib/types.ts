export type ColType = "Null" | "Boolean" | "Integer" | "Float" | "Date" | "String";

export interface Filter {
    col_index: number;
    operator: string;
    value: string;
}

export interface SchemaColumn {
    name: string;
    col_type: ColType;
}

export interface PreviewResult {
    schema: SchemaColumn[];
    rows: (string | null)[][];
}

export interface CategoryCount {
    name: string;
    value: number;
}

export interface HistogramBin {
    range_start: number;
    range_end: number;
    count: number;
}

export interface ColumnStats {
    col_index: number;
    total_count: number;
    null_count: number;
    min: number;
    max: number;
    mean: number;
    m2: number;
    numeric_count: number;
    q1: number;
    median: number;
    q3: number;
    outlier_pct: number;

    top_categories: CategoryCount[];
    unique_count_approx: number;
    is_high_cardinality: boolean;

    histogram: HistogramBin[];
}

export interface AnalysisResult {
    rows_processed: number;
    duplicate_rows: number;
    duplicates_capped: boolean;
    columns: ColumnStats[];
}
