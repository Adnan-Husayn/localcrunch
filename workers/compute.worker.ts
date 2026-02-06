
const ctx: Worker = self as any;

ctx.onmessage = (e: MessageEvent) => {

    const { action, buffer } = e.data;

    if (action === "analyze") {
        const view = new Uint8Array(buffer);
        const totalBytes = view.length;
        let processed = 0;
        const chunkSize = 5 * 1024 * 1024;

        const processChunk = () => {
            const remaining = totalBytes - processed;
            const currentChunkSize = Math.min(chunkSize, remaining);

            if (remaining <= 0) {
                ctx.postMessage(
                    { status: 'complete', result: `Processed ${totalBytes} bytes` },
                    [buffer]
                );
                return;
            }

            const end = processed + chunkSize;

            for (let i = processed; i < end; i++) {
                const _ = view[i];
            }

            processed += currentChunkSize;

            ctx.postMessage({
                status: "progress",
                progress: (processed / totalBytes) * 100,
            });

            setTimeout(processChunk, 0);
        }
        processChunk();
    }
};