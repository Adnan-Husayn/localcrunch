use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn init_hooks() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn debug_wasm() -> String {
    "WASM Engine Online".to_string()
}