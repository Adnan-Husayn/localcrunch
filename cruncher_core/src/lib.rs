use wasm_bindgen::prelude::*;
use serde::Serialize;
use std::io::Cursor;
use std::collections::HashMap;

#[derive(Serialize)]
pub struct AnalysisResult {
    rows_processed: usize,
    top_categories: Vec<CategoryCount>
}

#[derive(Serialize, Clone)]
pub struct CategoryCount {
    name: String,
    value: u32
}

#[wasm_bindgen]
pub struct DataProcessor { 
    total_rows: usize,
    tail_buffer: Vec<u8>,
    frequency_map: HashMap<String, u32>,
    target_column_index: usize
}

#[wasm_bindgen]
impl DataProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(column_index:usize) -> DataProcessor {
        DataProcessor { total_rows: 0, tail_buffer: Vec::new(), frequency_map: HashMap::new(), target_column_index: column_index }
    }

    pub fn process_chunk(&mut self, chunk: &[u8]) -> JsValue {
        let mut current_data = self.tail_buffer.clone();
        current_data.extend_from_slice(chunk);

        let split_index = current_data.iter().rposition(|&b| b == b'\n');
        let valid_data_range = match split_index {
            Some(idx) => idx + 1,
            None => 0
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
            }
        }

        let mut categories : Vec<CategoryCount> = self.frequency_map
        .iter()
        .map(|(k,v)| CategoryCount { name: k.clone(), value: *v })
        .collect();

        categories.sort_by(|a, b| b.value.cmp(&a.value));

        let top_5 = categories.into_iter().take(5).collect();

        let stats = AnalysisResult {
            rows_processed: self.total_rows,
            top_categories: top_5
        };

        serde_wasm_bindgen::to_value(&stats).unwrap()
    }
}