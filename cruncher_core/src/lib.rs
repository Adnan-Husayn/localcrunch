use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::io::Cursor;
use std::collections::HashMap;
use chrono::NaiveDate;

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
            if i >= 50 { break; }
            if let Ok(record) = result {
                let mut row_vec = Vec::new();
                for (idx, field) in record.iter().enumerate() {
                    let field = field.trim();
                    let val = if field.is_empty() { None } else { Some(field.to_string()) };
                    row_vec.push(val);
                    if idx < col_types.len() {
                         detect_type(&mut col_types[idx], field);
                    }
                }
                preview_rows.push(row_vec);
            }
        }

        let schema = headers.iter().zip(col_types.iter()).map(|(name, dtype)| {
            ColumnSchema { name: name.clone(), col_type: dtype.clone() }
        }).collect();

        let result = PreviewResult { schema, rows: preview_rows };
        serde_wasm_bindgen::to_value(&result).unwrap()
    }
}

fn detect_type(current_type: &mut ColumnType, value: &str) {
    if value.is_empty() { return; }
    if *current_type == ColumnType::String { return; }

    let is_bool = value.eq_ignore_ascii_case("true") || value.eq_ignore_ascii_case("false");
    let is_int = value.parse::<i64>().is_ok();
    let is_float = value.parse::<f64>().is_ok();
    let is_date = NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok();

    match current_type {
        ColumnType::Null => {
            if is_bool { *current_type = ColumnType::Boolean; }
            else if is_int { *current_type = ColumnType::Integer; }
            else if is_float { *current_type = ColumnType::Float; }
            else if is_date { *current_type = ColumnType::Date; }
            else { *current_type = ColumnType::String; }
        },
        ColumnType::Boolean => if !is_bool { 
            if is_int { *current_type = ColumnType::Integer; }
            else if is_float { *current_type = ColumnType::Float; }
            else { *current_type = ColumnType::String; }
        },
        ColumnType::Integer => if !is_int {
            if is_float { *current_type = ColumnType::Float; }
            else { *current_type = ColumnType::String; }
        },
        ColumnType::Float => if !is_float { *current_type = ColumnType::String; },
        ColumnType::Date => if !is_date { *current_type = ColumnType::String; },
        _ => {}
    }
}

#[derive(Serialize)]
pub struct AnalysisResult {
    rows_processed: usize,
    top_categories: Vec<CategoryCount>,
    match_count: usize,
    matches_preview: Vec<String>,
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
    frequency_map: HashMap<String, u32>,
    target_column_index: usize,
    search_term: String,
    match_count: usize,
    matches_preview: Vec<String>,
}

#[wasm_bindgen]
impl DataProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(column_index: usize, search_term: String) -> DataProcessor {
        DataProcessor {
            total_rows: 0,
            tail_buffer: Vec::new(),
            frequency_map: HashMap::new(),
            target_column_index: column_index,
            search_term,
            match_count: 0,
            matches_preview: Vec::new(),
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
                
                if let Some(val) = record.get(self.target_column_index) {
                    let count = self.frequency_map.entry(val.to_string()).or_insert(0);
                    *count += 1;
                }

                if !self.search_term.is_empty() {
                    let row_string = record.iter().collect::<Vec<&str>>().join(",");
                    if row_string.contains(&self.search_term) {
                        self.match_count += 1;
                        if self.matches_preview.len() < 5 {
                            self.matches_preview.push(row_string);
                        }
                    }
                }
            }
        }
        
        let mut categories: Vec<CategoryCount> = self.frequency_map
            .iter()
            .map(|(k, v)| CategoryCount { name: k.clone(), value: *v })
            .collect();
        categories.sort_by(|a, b| b.value.cmp(&a.value));
        let top_5 = categories.into_iter().take(5).collect();

        let stats = AnalysisResult {
            rows_processed: self.total_rows,
            top_categories: top_5,
            match_count: self.match_count,
            matches_preview: self.matches_preview.clone(),
        };

        serde_wasm_bindgen::to_value(&stats).unwrap()
    }
}