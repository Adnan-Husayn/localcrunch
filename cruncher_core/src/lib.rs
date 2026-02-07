use wasm_bindgen::prelude::*;
use serde::Serialize;
use std::io::Cursor;

#[derive(Serialize)]
pub struct ChunkStats {
    rows_processed: usize,
    numeric_sum: f64, 
}

#[wasm_bindgen]
pub struct DataProcessor {
    total_rows: usize,
    total_sum: f64,
    tail_buffer: Vec<u8>, 
}

#[wasm_bindgen]
impl DataProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> DataProcessor {
        DataProcessor {
            total_rows: 0,
            total_sum: 0.0,
            tail_buffer: Vec::new(),
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

        let mut chunk_rows = 0;
        let mut chunk_sum = 0.0;

        for result in rdr.records() {
            if let Ok(record) = result {
                chunk_rows += 1;
                
                if let Some(val) = record.get(1) {
                    if let Ok(num) = val.parse::<f64>() {
                        chunk_sum += num;
                    }
                }
            }
        }

        self.total_rows += chunk_rows;
        self.total_sum += chunk_sum;
        
        let stats = ChunkStats {
            rows_processed: self.total_rows,
            numeric_sum: self.total_sum,
        };

        serde_wasm_bindgen::to_value(&stats).unwrap()
    }
}