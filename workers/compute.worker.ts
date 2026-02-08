import init, { init_hooks, DataProcessor, SchemaDetector } from "../cruncher_core/pkg/cruncher_core";

const ctx: Worker = self as any;
let isWasmInitialized = false;

let processor: DataProcessor | null = null;

ctx.onmessage = async (e: MessageEvent) => {
    const { action, chunk, columnIndex } = e.data;

    if (action === 'init_wasm') {
        try {
            await init();
            if (typeof init_hooks === 'function') {
                init_hooks();
            }
            isWasmInitialized = true;
            ctx.postMessage({ status: 'complete', result: 'WASM engine online 🦀' });
        } catch (error) {
            console.error(error);
            ctx.postMessage({ status: 'error', error: 'Failed to load WASM' });
        }
        return;
    }

    if (action === "sniff_preview") {
        try {
            if (!isWasmInitialized) await init();
            const buffer = new Uint8Array(chunk);
            const result = SchemaDetector.sniff_preview(buffer);
            ctx.postMessage({ status: "preview_ready", result });
        } catch (err) {
            console.error(err);
            ctx.postMessage({ status: "error", error: "Failed to detect schema" });
        }
        return;
    }

    if (!isWasmInitialized) return;

    if (action === 'start_stream') {
        if (processor) {
            processor.free();
        }
        
        const col = columnIndex !== undefined ? columnIndex : 2;
        
        processor = new DataProcessor(col, ""); 

        ctx.postMessage({ status: 'ready' });
    }

    else if (action === 'chunk' && processor) {
        try {
            const stats = processor.process_chunk(new Uint8Array(chunk));

            ctx.postMessage({
                status: 'progress',
                stats,
                progress: 0 
            });
            ctx.postMessage({ status: "chunk_ack" });
            
        } catch (error) {
            console.error(error);
            ctx.postMessage({ status: "error", error: "processing failed" });
        }
    }

    else if (action === 'end_stream') {
        ctx.postMessage({
            status: "complete",
            result: `Job Finished`,
        });
    }
};