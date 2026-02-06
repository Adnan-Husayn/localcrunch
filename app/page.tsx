"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Idle");
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // 1. Initialize Worker
    workerRef.current = new Worker(new URL("../workers/compute.worker.ts", import.meta.url));

    // 2. Listen for messages from the worker
    workerRef.current.onmessage = (event) => {
      const { status, progress, result } = event.data;

      if (status === "progress") {
        setProgress(progress);
        setStatus(`Crunching... ${Math.round(progress)}%`);
      } else if (status === "complete") {
        setStatus("Done");
        setLogs((prev) => [...prev, `✅ ${result}`]);
        setProgress(100);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const handleStart = () => {
    if (!workerRef.current) return;

    setLogs((prev) => [...prev, "🚀 Starting Worker..."]);
    setStatus("Starting...");
    setProgress(0);

    // 1. Create a big fake buffer (100MB) to simulate a file
    const size = 100 * 1024 * 1024; 
    const buffer = new ArrayBuffer(size);
    
    // Fill edges to prove memory integrity
    const view = new Uint8Array(buffer);
    view[0] = 1; 
    view[size - 1] = 255;

    setLogs((prev) => [...prev, `📦 Created ${size / 1024 / 1024}MB Buffer`]);

    // 2. Send to worker using ZERO COPY (Transferable)
    // The second argument [buffer] moves the memory. It instantly vanishes from the main thread.
    workerRef.current.postMessage({ action: "analyze", buffer }, [buffer]);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-12 font-mono flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-8">
        
        <header className="border-b border-neutral-800 pb-6">
          <h1 className="text-3xl font-bold text-white mb-2">LocalCrunch v0.1</h1>
          <p className="text-neutral-500">Thread Isolation Test</p>
        </header>

        <div className="flex items-center justify-between bg-neutral-900 p-6 rounded-lg border border-neutral-800">
          <div className="flex flex-col gap-2">
             <span className="text-sm text-neutral-400">Status</span>
             <span className="text-xl font-medium text-white">{status}</span>
          </div>
          <button
            onClick={handleStart}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-md font-bold transition-all active:scale-95"
          >
            Analyze 100MB
          </button>
        </div>

        {/* Visual Progress Bar */}
        <div className="relative h-6 w-full bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
          <div 
            className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Logs Console */}
        <div className="bg-black border border-neutral-800 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm shadow-inner">
          {logs.length === 0 && <span className="text-neutral-600 italic">System ready...</span>}
          {logs.map((log, i) => (
            <div key={i} className="mb-2 text-neutral-300 border-b border-neutral-900 pb-1 last:border-0 last:mb-0">
              {log}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}