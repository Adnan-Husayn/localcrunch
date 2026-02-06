"use client";

import { useEffect, useRef, useState } from "react";
import { Dropzone } from "@/components/dropzone";

export default function Home() {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileRef = useRef<File | null>(null);
  const offsetRef = useRef(0);

  const CHUNK_SIZE = 10 * 1024 * 1024;

  useEffect(() => {
    workerRef.current = new Worker(new URL("../workers/compute.worker.ts", import.meta.url));

    workerRef.current.onmessage = (event) => {
      const { status, progress, result } = event.data;

      if (status === "complete" && result.includes("🦀")) {
        setLogs(prev => [...prev, `✅ ${result}`]);
        return;
      }

      if (status === "chunk_ack") {
        readNextChunk();
      } else if (status === "progress") {
        setProgress(progress);
      } else if (status === "complete") {
        setStatus("Done");
        setLogs(prev => [...prev, `✅ ${result}`]);
        setIsProcessing(false);
        setProgress(100);
      }
    };

    workerRef.current.postMessage({ action: "init_wasm" });

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const readNextChunk = () => {
    const file = fileRef.current;
    const offset = offsetRef.current;
    const worker = workerRef.current;

    if (!file || !worker) return;

    if (offset >= file.size) {
      worker.postMessage({ action: "end_stream" });
      return;
    }

    const chunk = file.slice(offset, offset + CHUNK_SIZE);

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const buffer = e.target.result as ArrayBuffer;
        worker.postMessage(
          { action: "chunk", chunk: buffer, fileSize: file.size },
          [buffer]
        );

        offsetRef.current += CHUNK_SIZE;
      }
    };
    reader.readAsArrayBuffer(chunk);
  };

  const handleFileSelect = (file: File) => {
    setLogs(prev => [...prev, `📄 Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`]);

    fileRef.current = file;
    offsetRef.current = 0;
    setIsProcessing(true);
    setProgress(0);
    setStatus("Streaming...");

    workerRef.current?.postMessage({ action: "start_stream" });
    readNextChunk();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-12 font-mono flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-8">

        <header className="border-b border-neutral-800 pb-6">
          <h1 className="text-3xl font-bold text-white mb-2">LocalCrunch v0.2</h1>
          <p className="text-neutral-500">Zero-Copy File Streaming</p>
        </header>

        <Dropzone onFileSelect={handleFileSelect} isProcessing={isProcessing} />

        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">Status: <span className="text-white">{status}</span></span>
          <span className="text-sm text-neutral-400">{Math.round(progress)}%</span>
        </div>

        <div className="relative h-2 w-full bg-neutral-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-75 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="bg-black border border-neutral-800 rounded-lg p-4 h-48 overflow-y-auto text-xs font-mono shadow-inner">
          {logs.map((log, i) => (
            <div key={i} className="mb-1 text-neutral-400 border-b border-neutral-900/50 pb-1">
              {log}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}