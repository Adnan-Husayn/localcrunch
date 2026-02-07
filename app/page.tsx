"use client";

import { useEffect, useRef, useState } from "react";
import { Dropzone } from "@/components/dropzone";

interface CrunchStats {
  rows_processed: number;
  numeric_sum: number;
}

export default function Home() {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [stats, setStats] = useState<CrunchStats>({ rows_processed: 0, numeric_sum: 0 });

  const fileRef = useRef<File | null>(null);
  const offsetRef = useRef(0);
  const CHUNK_SIZE = 10 * 1024 * 1024; 

  useEffect(() => {
    workerRef.current = new Worker(new URL("../workers/compute.worker.ts", import.meta.url));

    workerRef.current.onmessage = (event) => {
      const { status, result, stats: newStats } = event.data;

      if (status === "progress") {
        if (newStats) {
          setStats(newStats);
        }
        
        if (fileRef.current) {
           const percent = (offsetRef.current / fileRef.current.size) * 100;
           setProgress(percent);
        }
      } 
      
      else if (status === "chunk_ack") {
        readNextChunk();
      } 
      
      else if (status === "complete") {
        if (result.includes("🦀")) {
           setLogs(prev => [...prev, `✅ ${result}`]);
        } else {
           setStatus("Done");
           setLogs(prev => [...prev, `✅ ${result}`]);
           setIsProcessing(false);
           setProgress(100);
        }
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
    setStats({ rows_processed: 0, numeric_sum: 0 }); 
    setStatus("Crunching...");

    workerRef.current?.postMessage({ action: "start_stream" });
    readNextChunk();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-12 font-mono flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-8">
        
        <header className="border-b border-neutral-800 pb-6">
          <h1 className="text-3xl font-bold text-white mb-2">LocalCrunch v1.0</h1>
          <p className="text-neutral-500">Rust + WASM + WebWorkers</p>
        </header>

        <Dropzone onFileSelect={handleFileSelect} isProcessing={isProcessing} />

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-neutral-900 p-4 rounded border border-neutral-800">
            <div className="text-neutral-400 text-xs uppercase">Rows Processed</div>
            <div className="text-3xl text-white font-bold">
              {stats.rows_processed.toLocaleString()}
            </div>
          </div>
          <div className="bg-neutral-900 p-4 rounded border border-neutral-800">
            <div className="text-neutral-400 text-xs uppercase">Column Sum (Approximation)</div>
            <div className="text-3xl text-blue-400 font-bold">
              {stats.numeric_sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
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