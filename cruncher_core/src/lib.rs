use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use wasm_bindgen::prelude::*;

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
        }
    }

    fn update(&mut self, val_str: &str) {
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
        }
    }
}

#[derive(Serialize)]
pub struct AnalysisResult {
    rows_processed: usize,
    columns: Vec<ColumnStats>,
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
}

#[wasm_bindgen]
impl DataProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(col_count: usize) -> DataProcessor {
        let mut stats = Vec::with_capacity(col_count);
        for i in 0..col_count {
            stats.push(ColumnStats::new(i));
        }

        DataProcessor {
            total_rows: 0,
            tail_buffer: Vec::new(),
            column_stats: stats,
        }
    }

    pub fn process_chunk(&mut self, chunk: &[u8]) -> JsValue {
        let mut current_data = self.tail_buffer.clone();
        current_data.extend_from_slice(chunk);

        let split_index = current_data.iter().rposition(|&b| b == b'\n');
        let valid_data_range = match split_index {
            Some(idx) => idx + 1,
            None => 0,
        };

        let (valid_data, new_tail) = current_data.split_at(valid_data_range);
        self.tail_buffer = new_tail.to_vec();

        let mut rdr = csv::ReaderBuilder::new()
            .has_headers(false)
            .from_reader(Cursor::new(valid_data));

        for result in rdr.records() {
            if let Ok(record) = result {
                self.total_rows += 1;

                for (i, field) in record.iter().enumerate() {
                    if i < self.column_stats.len() {
                        self.column_stats[i].update(field);
                    }
                }
            }
        }

        let stats = AnalysisResult {
            rows_processed: self.total_rows,
            columns: self.column_stats.clone(),
        };

        serde_wasm_bindgen::to_value(&stats).unwrap()
    }
}