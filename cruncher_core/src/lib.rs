use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    hash::{Hash, Hasher},
    io::Cursor,
};
use wasm_bindgen::prelude::*;

const RESERVOIR_SIZE: usize = 2000;
/// Row fingerprints kept for duplicate detection (8 bytes each, so ~16 MB).
const MAX_TRACKED_ROWS: usize = 2_000_000;

#[wasm_bindgen(start)]
fn start() {
    console_error_panic_hook::set_once();
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum ColumnType {
    Null,
    Boolean,
    Integer,
    Float,
    Date,
    String,
}

#[derive(Serialize)]
pub struct ColumnSchema {
    name: String,
    col_type: ColumnType,
}

#[derive(Serialize)]
pub struct PreviewResult {
    schema: Vec<ColumnSchema>,
    rows: Vec<Vec<Option<String>>>,
}

#[wasm_bindgen]
pub struct SchemaDetector;

#[wasm_bindgen]
impl SchemaDetector {
    pub fn sniff_preview(chunk: &[u8]) -> JsValue {
        let mut rdr = csv::ReaderBuilder::new()
            .has_headers(true)
            .flexible(true)
            .from_reader(Cursor::new(chunk));

        let headers: Vec<String> = match rdr.headers() {
            Ok(h) => h.iter().map(|s| s.to_string()).collect(),
            Err(_) => vec![],
        };

        let mut col_types = vec![ColumnType::Null; headers.len()];
        let mut preview_rows = Vec::new();

        for (i, result) in rdr.records().enumerate() {
            if i >= 50 {
                break;
            }
            if let Ok(record) = result {
                let mut row_vec = Vec::new();
                for (idx, field) in record.iter().enumerate() {
                    let field = field.trim();
                    let val = if field.is_empty() {
                        None
                    } else {
                        Some(field.to_string())
                    };
                    row_vec.push(val);
                    if idx < col_types.len() {
                        detect_type(&mut col_types[idx], field);
                    }
                }
                preview_rows.push(row_vec);
            }
        }

        let schema = headers
            .iter()
            .zip(col_types.iter())
            .map(|(name, dtype)| ColumnSchema {
                name: name.clone(),
                col_type: dtype.clone(),
            })
            .collect();

        let result = PreviewResult {
            schema,
            rows: preview_rows,
        };
        serde_wasm_bindgen::to_value(&result).unwrap()
    }
}

fn detect_type(current_type: &mut ColumnType, value: &str) {
    if value.is_empty() {
        return;
    }
    if *current_type == ColumnType::String {
        return;
    }

    let is_bool = value.eq_ignore_ascii_case("true") || value.eq_ignore_ascii_case("false");
    let is_int = value.parse::<i64>().is_ok();
    let is_float = value.parse::<f64>().is_ok();
    let is_date = NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok();

    match current_type {
        ColumnType::Null => {
            if is_bool {
                *current_type = ColumnType::Boolean;
            } else if is_int {
                *current_type = ColumnType::Integer;
            } else if is_float {
                *current_type = ColumnType::Float;
            } else if is_date {
                *current_type = ColumnType::Date;
            } else {
                *current_type = ColumnType::String;
            }
        }
        ColumnType::Boolean => {
            if !is_bool {
                if is_int {
                    *current_type = ColumnType::Integer;
                } else if is_float {
                    *current_type = ColumnType::Float;
                } else {
                    *current_type = ColumnType::String;
                }
            }
        }
        ColumnType::Integer => {
            if !is_int {
                if is_float {
                    *current_type = ColumnType::Float;
                } else {
                    *current_type = ColumnType::String;
                }
            }
        }
        ColumnType::Float => {
            if !is_float {
                *current_type = ColumnType::String;
            }
        }
        ColumnType::Date => {
            if !is_date {
                *current_type = ColumnType::String;
            }
        }
        _ => {}
    }
}

#[derive(Serialize, Clone)]
pub struct HistogramBin {
    range_start: f64,
    range_end: f64,
    count: u32,
}

#[derive(Serialize, Clone)]
pub struct ColumnStats {
    col_index: usize,
    total_count: usize,
    null_count: usize,

    min: f64,
    max: f64,
    sum: f64,
    mean: f64,
    m2: f64,
    numeric_count: usize,

    // Estimated from the reservoir sample, so approximate on large files.
    q1: f64,
    median: f64,
    q3: f64,
    outlier_pct: f64,

    #[serde(skip)]
    frequency_map: HashMap<String, u32>,

    top_categories: Vec<CategoryCount>,
    unique_count_approx: usize,
    is_high_cardinality: bool,

    #[serde(skip)]
    reservoir: Vec<f64>,
    histogram: Vec<HistogramBin>,
    #[serde(skip)]
    rng: u32,
}

impl ColumnStats {
    fn new(index: usize) -> Self {
        ColumnStats {
            col_index: index,
            total_count: 0,
            null_count: 0,
            min: f64::MAX,
            max: f64::MIN,
            sum: 0.0,
            mean: 0.0,
            m2: 0.0,
            numeric_count: 0,
            q1: 0.0,
            median: 0.0,
            q3: 0.0,
            outlier_pct: 0.0,
            frequency_map: HashMap::new(),
            top_categories: Vec::new(),
            unique_count_approx: 0,
            is_high_cardinality: false,
            reservoir: Vec::with_capacity(RESERVOIR_SIZE),
            histogram: Vec::new(),
            rng: (index as u32).wrapping_mul(123456789) + 1,
        }
    }

    fn update(&mut self, val_str: &str) {
        // Same trimming as schema detection, so "a, b" style files agree with it.
        let val_str = val_str.trim();
        self.total_count += 1;

        if val_str.is_empty() {
            self.null_count += 1;
            return;
        }

        if let Ok(val) = val_str.parse::<f64>() {
            self.numeric_count += 1;
            self.sum += val;

            if val < self.min {
                self.min = val;
            }
            if val > self.max {
                self.max = val;
            }

            let delta = val - self.mean;
            self.mean += delta / self.numeric_count as f64;
            let delta2 = val - self.mean;
            self.m2 += delta * delta2;

            if self.reservoir.len() < RESERVOIR_SIZE {
                self.reservoir.push(val);
            } else {
                let mut rng = SimpleRng::new(self.rng);
                let r = rng.next_f64();
                self.rng = rng.state;

                if r < (RESERVOIR_SIZE as f64 / self.numeric_count as f64) {
                    let replace_idx = (rng.next_f64() * RESERVOIR_SIZE as f64) as usize;
                    if replace_idx < self.reservoir.len() {
                        self.reservoir[replace_idx] = val;
                    }
                    self.rng = rng.state;
                }
            }
        }

        if !self.is_high_cardinality {
            let count = self.frequency_map.entry(val_str.to_string()).or_insert(0);
            *count += 1;

            if self.frequency_map.len() > 1000 {
                self.is_high_cardinality = true;
            }
        } else {
            if let Some(count) = self.frequency_map.get_mut(val_str) {
                *count += 1;
            }
        }
    }

    fn finalize_chunk(&mut self) {
        let mut categories: Vec<CategoryCount> = self
            .frequency_map
            .iter()
            .map(|(k, v)| CategoryCount {
                name: k.clone(),
                value: *v,
            })
            .collect();

        categories.sort_by(|a, b| b.value.cmp(&a.value).then_with(|| a.name.cmp(&b.name)));

        self.top_categories = categories.into_iter().take(5).collect();
        self.unique_count_approx = self.frequency_map.len();

        if !self.reservoir.is_empty() {
            let mut sorted = self.reservoir.clone();
            sorted.sort_by(|a, b| a.total_cmp(b));
            self.q1 = percentile(&sorted, 0.25);
            self.median = percentile(&sorted, 0.5);
            self.q3 = percentile(&sorted, 0.75);

            let iqr = self.q3 - self.q1;
            self.outlier_pct = if iqr > 0.0 {
                let (lo, hi) = (self.q1 - 1.5 * iqr, self.q3 + 1.5 * iqr);
                let outliers = sorted.iter().filter(|&&v| v < lo || v > hi).count();
                outliers as f64 / sorted.len() as f64 * 100.0
            } else {
                0.0
            };
        }

        if !self.reservoir.is_empty() && self.min < self.max {
            let num_bins = 20;
            let range = self.max - self.min;
            let step = range / num_bins as f64;

            let mut bins: Vec<HistogramBin> = (0..num_bins)
                .map(|i| HistogramBin {
                    range_start: self.min + (i as f64 * step),
                    range_end: self.min + ((i + 1) as f64 * step),
                    count: 0,
                })
                .collect();

            for &sample in &self.reservoir {
                if sample >= self.min && sample <= self.max {
                    let mut bin_indx = ((sample - self.min) / step) as usize;
                    if bin_indx >= num_bins {
                        bin_indx = num_bins - 1;
                    }
                    bins[bin_indx].count += 1;
                }
            }
            self.histogram = bins;
        }
    }
}

#[derive(Serialize)]
pub struct AnalysisResult {
    rows_processed: usize,
    duplicate_rows: usize,
    duplicates_capped: bool,
    columns: Vec<ColumnStats>,
}

/// Linear-interpolated percentile of an already sorted, non-empty slice.
fn percentile(sorted: &[f64], p: f64) -> f64 {
    let pos = p * (sorted.len() - 1) as f64;
    let (lo, hi) = (pos.floor() as usize, pos.ceil() as usize);
    sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo as f64)
}

struct SimpleRng {
    state: u32,
}
impl SimpleRng {
    fn new(seed: u32) -> Self {
        SimpleRng { state: seed }
    }
    fn next_f64(&mut self) -> f64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.state = x;
        (x as f64) / (u32::MAX as f64)
    }
}


const SUPPORTED_OPERATORS: [&str; 7] = ["==", "!=", "contains", ">", "<", ">=", "<="];

#[derive(Serialize, Deserialize, Clone)]
pub struct Filter {
    col_index: usize,
    operator: String,
    value: String,
}

#[derive(Serialize, Clone)]
pub struct CategoryCount {
    name: String,
    value: u32,
}

#[wasm_bindgen]
pub struct DataProcessor {
    total_rows: usize,
    tail_buffer: Vec<u8>,
    column_stats: Vec<ColumnStats>,
    filters: Vec<Filter>,
    header_pending: bool,
    seen_rows: HashSet<u64>,
    duplicate_rows: usize,
    duplicates_capped: bool,
}

#[wasm_bindgen]
impl DataProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(col_count: usize, filters_val: JsValue) -> Result<DataProcessor, JsError> {
        let filters: Vec<Filter> = if filters_val.is_undefined() || filters_val.is_null() {
            Vec::new()
        } else {
            serde_wasm_bindgen::from_value(filters_val)
                .map_err(|e| JsError::new(&format!("invalid filters: {e}")))?
        };
        Self::from_filters(col_count, filters).map_err(|e| JsError::new(&e))
    }

    pub fn process_chunk(&mut self, chunk: &[u8]) -> JsValue {
        self.ingest(chunk);
        self.get_results()
    }

    /// Parses whatever is left in the tail buffer (a final row with no trailing
    /// newline) and returns the final results. Call once, after the last chunk.
    pub fn finish(&mut self) -> JsValue {
        self.flush_tail();
        self.get_results()
    }

    pub fn get_results(&mut self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.snapshot()).unwrap()
    }
}

impl DataProcessor {
    fn from_filters(col_count: usize, filters: Vec<Filter>) -> Result<DataProcessor, String> {
        for filter in &filters {
            if !SUPPORTED_OPERATORS.contains(&filter.operator.as_str()) {
                return Err(format!("unsupported filter operator: {}", filter.operator));
            }
        }

        Ok(DataProcessor {
            total_rows: 0,
            tail_buffer: Vec::new(),
            column_stats: (0..col_count).map(ColumnStats::new).collect(),
            filters,
            header_pending: true,
            seen_rows: HashSet::new(),
            duplicate_rows: 0,
            duplicates_capped: false,
        })
    }

    fn ingest(&mut self, chunk: &[u8]) {
        let mut data = std::mem::take(&mut self.tail_buffer);
        data.extend_from_slice(chunk);

        let boundary = last_record_boundary(&data);
        self.tail_buffer = data.split_off(boundary);
        self.parse_records(&data);
    }

    fn flush_tail(&mut self) {
        let data = std::mem::take(&mut self.tail_buffer);
        self.parse_records(&data);
    }

    fn parse_records(&mut self, data: &[u8]) {
        let mut rdr = csv::ReaderBuilder::new()
            .has_headers(false)
            .flexible(true)
            .from_reader(data);

        for record in rdr.records().flatten() {
            if self.header_pending {
                self.header_pending = false;
                continue;
            }
            if !self.check_row(&record) {
                continue;
            }
            self.total_rows += 1;
            self.track_duplicate(&record);
            for (col, field) in self.column_stats.iter_mut().zip(record.iter()) {
                col.update(field);
            }
        }
    }

    /// Counts a row as a duplicate if an identical one was already seen. Rows
    /// are fingerprinted with a 64-bit hash rather than stored, and tracking
    /// stops growing at MAX_TRACKED_ROWS, after which the count is a lower bound.
    fn track_duplicate(&mut self, record: &csv::StringRecord) {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        for field in record.iter() {
            field.hash(&mut hasher);
        }
        let fingerprint = hasher.finish();

        if self.seen_rows.contains(&fingerprint) {
            self.duplicate_rows += 1;
        } else if self.seen_rows.len() < MAX_TRACKED_ROWS {
            self.seen_rows.insert(fingerprint);
        } else {
            self.duplicates_capped = true;
        }
    }

    fn check_row(&self, record: &csv::StringRecord) -> bool {
        self.filters.iter().all(|filter| match record.get(filter.col_index) {
            Some(field) => filter_matches(field, filter),
            None => false,
        })
    }

    fn snapshot(&mut self) -> AnalysisResult {
        for col in &mut self.column_stats {
            col.finalize_chunk();
        }

        AnalysisResult {
            rows_processed: self.total_rows,
            duplicate_rows: self.duplicate_rows,
            duplicates_capped: self.duplicates_capped,
            columns: self.column_stats.clone(),
        }
    }
}

/// Index just past the last newline that is not inside a quoted field, or 0 if
/// there is none. Everything after it is an incomplete record and is carried
/// over to the next chunk. Chunks always start at a record boundary, so quote
/// state starts closed; an escaped quote ("") toggles twice and cancels out.
fn last_record_boundary(data: &[u8]) -> usize {
    let mut in_quotes = false;
    let mut boundary = 0;
    for (i, &b) in data.iter().enumerate() {
        match b {
            b'"' => in_quotes = !in_quotes,
            b'\n' if !in_quotes => boundary = i + 1,
            _ => {}
        }
    }
    boundary
}

fn filter_matches(field: &str, filter: &Filter) -> bool {
    let field = field.trim();
    let target = filter.value.trim();
    match filter.operator.as_str() {
        "==" => field == target,
        "!=" => field != target,
        "contains" => field.contains(target),
        op => {
            let ordering = match (field.parse::<f64>(), target.parse::<f64>()) {
                (Ok(a), Ok(b)) => a.partial_cmp(&b),
                _ => Some(field.cmp(target)),
            };
            match (op, ordering) {
                (">", Some(o)) => o.is_gt(),
                ("<", Some(o)) => o.is_lt(),
                (">=", Some(o)) => o.is_ge(),
                ("<=", Some(o)) => o.is_le(),
                _ => false,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn processor(cols: usize, filters: Vec<Filter>) -> DataProcessor {
        DataProcessor::from_filters(cols, filters).unwrap()
    }

    fn filter(col_index: usize, operator: &str, value: &str) -> Filter {
        Filter {
            col_index,
            operator: operator.to_string(),
            value: value.to_string(),
        }
    }

    fn detected(values: &[&str]) -> ColumnType {
        let mut t = ColumnType::Null;
        for v in values {
            detect_type(&mut t, v);
        }
        t
    }

    #[test]
    fn type_inference() {
        assert_eq!(detected(&["1", "2", "3"]), ColumnType::Integer);
        assert_eq!(detected(&["1", "2.5"]), ColumnType::Float);
        assert_eq!(detected(&["true", "FALSE"]), ColumnType::Boolean);
        assert_eq!(detected(&["2024-01-31", "2023-12-01"]), ColumnType::Date);
        assert_eq!(detected(&["2024-01-31", "nope"]), ColumnType::String);
        assert_eq!(detected(&["1", "abc", "2"]), ColumnType::String);
        assert_eq!(detected(&["", ""]), ColumnType::Null);
    }

    #[test]
    fn welford_mean_and_variance() {
        // Classic example: mean 5, population variance 4 => m2 = 32.
        let mut p = processor(1, vec![]);
        p.ingest(b"v\n2\n4\n4\n4\n5\n5\n7\n9\n");
        let col = &p.snapshot().columns[0];
        assert_eq!(col.numeric_count, 8);
        assert!((col.mean - 5.0).abs() < 1e-12);
        assert!((col.m2 - 32.0).abs() < 1e-9);
        assert_eq!(col.min, 2.0);
        assert_eq!(col.max, 9.0);
    }

    #[test]
    fn header_row_is_not_counted_as_data() {
        let mut p = processor(2, vec![]);
        p.ingest(b"name,age\nann,30\nbob,40\n");
        let result = p.snapshot();
        assert_eq!(result.rows_processed, 2);
        assert_eq!(result.columns[0].total_count, 2);
        assert!(result.columns[0].top_categories.iter().all(|c| c.name != "name"));
    }

    #[test]
    fn header_split_across_chunks() {
        let mut p = processor(2, vec![]);
        p.ingest(b"na");
        p.ingest(b"me,age\nann,30\n");
        assert_eq!(p.snapshot().rows_processed, 1);
    }

    #[test]
    fn row_split_across_chunks() {
        let mut p = processor(2, vec![]);
        p.ingest(b"id,v\n1,10\n2,2");
        p.ingest(b"0\n3,30\n");
        let result = p.snapshot();
        assert_eq!(result.rows_processed, 3);
        assert_eq!(result.columns[1].sum, 60.0);
    }

    #[test]
    fn last_row_without_trailing_newline_is_flushed() {
        let mut p = processor(1, vec![]);
        p.ingest(b"id\n1\n2");
        assert_eq!(p.snapshot().rows_processed, 1);
        p.flush_tail();
        let result = p.snapshot();
        assert_eq!(result.rows_processed, 2);
        assert_eq!(result.columns[0].sum, 3.0);
    }

    #[test]
    fn flush_tail_is_a_noop_when_file_ends_with_newline() {
        let mut p = processor(1, vec![]);
        p.ingest(b"id\n1\n2\n");
        p.flush_tail();
        assert_eq!(p.snapshot().rows_processed, 2);
    }

    #[test]
    fn newline_inside_quoted_field_does_not_split_a_record() {
        let mut p = processor(2, vec![]);
        // The chunk boundary lands right after the newline inside the quotes.
        p.ingest(b"a,b\n1,\"x\n");
        p.ingest(b"y\"\n2,z\n");
        p.flush_tail();
        let result = p.snapshot();
        assert_eq!(result.rows_processed, 2);
        let names: Vec<&str> = result.columns[1]
            .top_categories
            .iter()
            .map(|c| c.name.as_str())
            .collect();
        assert!(names.contains(&"x\ny"));
        assert!(names.contains(&"z"));
    }

    #[test]
    fn escaped_quotes_keep_quote_state_balanced() {
        assert_eq!(last_record_boundary(b"a,\"he said \"\"hi\"\"\"\nb"), 19);
        assert_eq!(last_record_boundary(b"no newline"), 0);
        assert_eq!(last_record_boundary(b"a,\"open\nstill open"), 0);
    }

    #[test]
    fn crlf_line_endings() {
        let mut p = processor(2, vec![]);
        p.ingest(b"id,v\r\n1,10\r\n2,20\r\n");
        let result = p.snapshot();
        assert_eq!(result.rows_processed, 2);
        assert_eq!(result.columns[1].sum, 30.0);
    }

    #[test]
    fn ragged_rows_are_not_dropped() {
        let mut p = processor(3, vec![]);
        p.ingest(b"a,b,c\n1,2,3\n4,5\n6,7,8,9\n");
        assert_eq!(p.snapshot().rows_processed, 3);
    }

    #[test]
    fn equality_and_contains_filters() {
        let csv = b"name,city\nann,paris\nbob,berlin\ncat,paris\n";

        let mut p = processor(2, vec![filter(1, "==", "paris")]);
        p.ingest(csv);
        assert_eq!(p.snapshot().rows_processed, 2);

        let mut p = processor(2, vec![filter(1, "!=", "paris")]);
        p.ingest(csv);
        assert_eq!(p.snapshot().rows_processed, 1);

        let mut p = processor(2, vec![filter(1, "contains", "er")]);
        p.ingest(csv);
        assert_eq!(p.snapshot().rows_processed, 1);
    }

    #[test]
    fn numeric_comparison_filters_are_numeric_not_lexicographic() {
        let csv = b"v\n9\n10\n100\n";

        let mut p = processor(1, vec![filter(0, ">", "9")]);
        p.ingest(csv);
        assert_eq!(p.snapshot().rows_processed, 2);

        let mut p = processor(1, vec![filter(0, ">=", "10")]);
        p.ingest(csv);
        assert_eq!(p.snapshot().rows_processed, 2);

        let mut p = processor(1, vec![filter(0, "<=", "10")]);
        p.ingest(csv);
        assert_eq!(p.snapshot().rows_processed, 2);

        let mut p = processor(1, vec![filter(0, "<", "10")]);
        p.ingest(csv);
        assert_eq!(p.snapshot().rows_processed, 1);
    }

    #[test]
    fn string_comparison_falls_back_when_not_numeric() {
        assert!(filter_matches("banana", &filter(0, ">", "apple")));
        assert!(filter_matches("apple", &filter(0, ">=", "apple")));
        assert!(filter_matches("apple", &filter(0, "<=", "apple")));
        assert!(!filter_matches("apple", &filter(0, "<", "apple")));
    }

    #[test]
    fn multiple_filters_are_anded() {
        let mut p = processor(
            2,
            vec![filter(0, "contains", "a"), filter(1, ">", "20")],
        );
        p.ingest(b"name,age\nann,30\nbob,40\ncat,10\n");
        assert_eq!(p.snapshot().rows_processed, 1);
    }

    #[test]
    fn filter_on_missing_column_rejects_row() {
        let mut p = processor(3, vec![filter(2, "==", "x")]);
        p.ingest(b"a,b,c\n1,2\n1,2,x\n");
        assert_eq!(p.snapshot().rows_processed, 1);
    }

    #[test]
    fn unknown_operator_is_rejected_up_front() {
        assert!(DataProcessor::from_filters(1, vec![filter(0, "~=", "x")]).is_err());
        assert!(DataProcessor::from_filters(1, vec![filter(0, ">=", "1")]).is_ok());
    }

    #[test]
    fn nulls_are_counted_and_excluded_from_numeric_stats() {
        let mut p = processor(2, vec![]);
        p.ingest(b"a,b\n1,\n,5\n3,7\n");
        let result = p.snapshot();
        assert_eq!(result.columns[0].null_count, 1);
        assert_eq!(result.columns[0].numeric_count, 2);
        assert_eq!(result.columns[1].null_count, 1);
    }

    #[test]
    fn histogram_has_twenty_bins_covering_the_range() {
        let mut p = processor(1, vec![]);
        let mut csv = String::from("v\n");
        for i in 0..100 {
            csv.push_str(&format!("{i}\n"));
        }
        p.ingest(csv.as_bytes());
        let hist = &p.snapshot().columns[0].histogram;
        assert_eq!(hist.len(), 20);
        assert_eq!(hist[0].range_start, 0.0);
        assert_eq!(hist[19].range_end, 99.0);
        assert_eq!(hist.iter().map(|b| b.count).sum::<u32>(), 100);
    }

    #[test]
    fn duplicate_rows_are_counted_after_the_first_occurrence() {
        let mut p = processor(2, vec![]);
        p.ingest(b"a,b\n1,x\n2,y\n1,x\n1,x\n3,z\n");
        let result = p.snapshot();
        assert_eq!(result.rows_processed, 5);
        assert_eq!(result.duplicate_rows, 2);
        assert!(!result.duplicates_capped);
    }

    #[test]
    fn duplicate_detection_respects_filters_and_field_boundaries() {
        // "ab,c" and "a,bc" must not collide, and filtered-out rows don't count.
        let mut p = processor(2, vec![filter(0, "!=", "skip")]);
        p.ingest(b"a,b\nab,c\na,bc\nskip,q\nskip,q\n");
        let result = p.snapshot();
        assert_eq!(result.rows_processed, 2);
        assert_eq!(result.duplicate_rows, 0);
    }

    #[test]
    fn quartiles_and_median_come_from_the_sample() {
        let mut p = processor(1, vec![]);
        let mut csv = String::from("v\n");
        for i in 1..=101 {
            csv.push_str(&format!("{i}\n"));
        }
        p.ingest(csv.as_bytes());
        let col = &p.snapshot().columns[0];
        assert_eq!(col.median, 51.0);
        assert_eq!(col.q1, 26.0);
        assert_eq!(col.q3, 76.0);
        assert_eq!(col.outlier_pct, 0.0);
    }

    #[test]
    fn outliers_use_the_iqr_rule() {
        let mut p = processor(1, vec![]);
        let mut csv = String::from("v\n");
        for i in 0..96 {
            csv.push_str(&format!("{}\n", 10 + i % 5));
        }
        for _ in 0..4 {
            csv.push_str("1000\n");
        }
        p.ingest(csv.as_bytes());
        let col = &p.snapshot().columns[0];
        assert!((col.outlier_pct - 4.0).abs() < 1e-9);
    }

    #[test]
    fn percentile_interpolates_between_values() {
        assert_eq!(percentile(&[1.0, 2.0, 3.0, 4.0], 0.5), 2.5);
        assert_eq!(percentile(&[7.0], 0.9), 7.0);
    }

    #[test]
    fn top_categories_break_ties_by_name() {
        let mut p = processor(1, vec![]);
        p.ingest(b"v\nb\na\nc\n");
        let names: Vec<String> = p.snapshot().columns[0].top_categories.iter().map(|c| c.name.clone()).collect();
        assert_eq!(names, vec!["a", "b", "c"]);
    }

    #[test]
    fn padded_fields_are_trimmed_like_schema_detection() {
        let mut p = processor(2, vec![]);
        p.ingest(b"a, b\n1, 10\n2,  20 \n3,   \n");
        let result = p.snapshot();
        assert_eq!(result.columns[1].numeric_count, 2);
        assert_eq!(result.columns[1].sum, 30.0);
        // A whitespace-only field counts as missing.
        assert_eq!(result.columns[1].null_count, 1);
    }

    #[test]
    fn filters_ignore_padding_on_both_sides() {
        let mut p = processor(2, vec![filter(1, "==", " paris ")]);
        p.ingest(b"a,b\n1, paris\n2,berlin\n");
        assert_eq!(p.snapshot().rows_processed, 1);
    }
}
