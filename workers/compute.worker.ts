import init, { debug_wasm, init_hooks } from "../cruncher_core/pkg/cruncher_core";

const ctx: Worker = self as any;
let isWasmInitialized = false;

let totalBytesReceived = 0;

ctx.onmessage = async (e: MessageEvent) => {

    const { action, chunk, fileSize } = e.data;

    if (action === 'start_stream') {
        try {
            await init();
            init_hooks();

            isWasmInitialized = true;

            const message = debug_wasm();

            ctx.postMessage({
                status: "complete",
                result: message
            });
        } catch (error) {
            console.error("WASM Failed to load:", error);
            ctx.postMessage({ status: 'error', error: 'Failed to load WASM' });
        }
        return;
    }
    if (!isWasmInitialized && (action === "start_stream" || action === "chunk")) {
        console.warn("WASM not initialized yet!");
        return;
    }

    else if (action === 'chunk') {
        const view = new Uint8Array(chunk);

        totalBytesReceived += view.length;

        ctx.postMessage({
            status: 'progress',
            processed: totalBytesReceived,
            progress: (totalBytesReceived / fileSize) * 100,
        })

        ctx.postMessage({ status: 'chunk_ack' })
    }

    else if (action === 'end_stream') {
        ctx.postMessage({
            status: "complete",
            result: `Streaming Complete. Received ${totalBytesReceived} bytes.`,
        });
    }
};