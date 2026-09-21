import init, { DataProcessor, SchemaDetector } from "../cruncher_core/pkg/cruncher_core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = self as any;

let processor: DataProcessor | null = null;
let lastThrottledTime = 0;

// One shared promise, so messages that arrive while WASM is still loading all
// wait for the same initialization instead of racing it.
let wasmReady: Promise<unknown> | null = null;
const ensureWasm = () => (wasmReady ??= init());

const fail = (error: unknown, message: string) => {
    console.error(error);
    ctx.postMessage({ status: "error", error: message });
};

ctx.onmessage = async (e: MessageEvent) => {
    const { action, chunk, columnCount, filters } = e.data;

    if (action === "init_wasm") {
        try {
            await ensureWasm();
            ctx.postMessage({ status: "wasm_ready" });
        } catch (error) {
            wasmReady = null;
            fail(error, "Couldn't load the analysis engine. Try reloading the page.");
        }
        return;
    }

    if (action === "sniff_preview") {
        try {
            await ensureWasm();
            const result = SchemaDetector.sniff_preview(new Uint8Array(chunk));
            ctx.postMessage({ status: "preview_ready", result });
        } catch (error) {
            fail(error, "Couldn't read this file as a CSV.");
        }
        return;
    }

    if (action === "start_stream") {
        try {
            await ensureWasm();
            processor?.free();
            processor = new DataProcessor(columnCount || 1, filters || []);
            lastThrottledTime = 0;
            ctx.postMessage({ status: "ready" });
        } catch (error) {
            processor = null;
            fail(error, error instanceof Error ? error.message : String(error));
        }
    }

    else if (action === "chunk" && processor) {
        try {
            const stats = processor.process_chunk(new Uint8Array(chunk));

            const now = Date.now();
            if (now - lastThrottledTime > 300) {
                ctx.postMessage({ status: "progress", stats });
                lastThrottledTime = now;
            } else {
                ctx.postMessage({ status: "progress" });
            }

            ctx.postMessage({ status: "chunk_ack" });
        } catch (error) {
            fail(error, "Something went wrong while analyzing the file.");
        }
    }

    else if (action === "end_stream" && processor) {
        try {
            // finish() also parses a last row that has no trailing newline.
            ctx.postMessage({ status: "progress", stats: processor.finish() });
            ctx.postMessage({ status: "complete" });
        } catch (error) {
            fail(error, "Something went wrong while finishing the analysis.");
        }
    }
};
