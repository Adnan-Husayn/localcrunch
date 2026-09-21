/* tslint:disable */
/* eslint-disable */

export class DataProcessor {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Parses whatever is left in the tail buffer (a final row with no trailing
     * newline) and returns the final results. Call once, after the last chunk.
     */
    finish(): any;
    get_results(): any;
    constructor(col_count: number, filters_val: any);
    process_chunk(chunk: Uint8Array): any;
}

export class SchemaDetector {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static sniff_preview(chunk: Uint8Array): any;
}

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_dataprocessor_free: (a: number, b: number) => void;
    readonly __wbg_schemadetector_free: (a: number, b: number) => void;
    readonly dataprocessor_finish: (a: number) => any;
    readonly dataprocessor_get_results: (a: number) => any;
    readonly dataprocessor_new: (a: number, b: any) => [number, number, number];
    readonly dataprocessor_process_chunk: (a: number, b: number, c: number) => any;
    readonly schemadetector_sniff_preview: (a: number, b: number) => any;
    readonly start: () => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
