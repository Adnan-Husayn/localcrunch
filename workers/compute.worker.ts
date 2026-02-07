import init, { DataProcessor } from "../cruncher_core/pkg/cruncher_core";
import init_hooks from "../cruncher_core/pkg/cruncher_core";

const ctx: Worker = self as any;
let isWasmInitialized = false;
let processor: DataProcessor | null = null;

ctx.onmessage = async (e: MessageEvent) => {

    const { action, chunk, columnIndex } = e.data;

    if (action === 'init_wasm') {
        try {
            await init();
            init_hooks();
            isWasmInitialized = true;
            ctx.postMessage({ status: 'complete', result: 'WASM engine online' });
        } catch (error) {
            ctx.postMessage({ status: 'error', error: 'Failed to load WASM' });
        }
        return;
    }

    if (!isWasmInitialized) return;

    if (action === 'start_stream') {
        if (processor) {
            processor.free();
        }
        const col = columnIndex !== undefined ? columnIndex : 2;
        processor = new DataProcessor(col);

        ctx.postMessage({ status: 'ready' });
    }

    else if (action === 'chunk' && processor) {
        try {
            const stats = processor.process_chunk(new Uint8Array(chunk));

            ctx.postMessage({
                status: 'progress',
                stats,
                progress: 0
            })
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