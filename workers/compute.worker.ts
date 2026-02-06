import { act } from "react";

const ctx: Worker = self as any;

let totalBytesReceived = 0;

ctx.onmessage = (e: MessageEvent) => {

    const { action, chunk, fileSize } = e.data;

    if (action === 'start_stream') {
        totalBytesReceived = 0;
        ctx.postMessage({ status: 'ready' });
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