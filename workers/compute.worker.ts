import init, { DataProcessor, SchemaDetector } from "../cruncher_core/pkg/cruncher_core";
import init_hooks from '../cruncher_core/pkg/cruncher_core';

const ctx: Worker = self as any;
let isWasmInitialized = false;

let processor: DataProcessor | null = null;
let lastThrottledTime = 0;

ctx.onmessage = async (e: MessageEvent) => {
    const { action, chunk, columnIndex, columnCount } = e.data;

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
        if (processor) processor.free();

        const count = columnCount || 1;
        processor = new DataProcessor(count);
        lastThrottledTime = 0;
        ctx.postMessage({ status: 'ready' });
    }

    else if (action === 'chunk' && processor) {
        try {
            const stats = processor.process_chunk(new Uint8Array(chunk));

            const now = Date.now();
            if (now - lastThrottledTime > 300) {
                ctx.postMessage({
                    status: 'progress',
                    stats,
                    progress: 0
                });
                lastThrottledTime = now;
            } else {
                ctx.postMessage({ status: 'progress' });
            }

            ctx.postMessage({ status: "chunk_ack" });
        } catch (error) {
            console.error(error);
            ctx.postMessage({ status: "error", error: "processing failed" });
        }
    }

    else if (action === 'end_stream') {
        if ( processor ) {
            const finalStats = processor.get_results();
            ctx.postMessage({status: 'progress', stats: finalStats});
        }
        
        ctx.postMessage({
            status: "complete",
            result: `Job Finished`,
        });
    }
};