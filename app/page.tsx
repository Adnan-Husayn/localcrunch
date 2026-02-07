"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Dropzone } from "@/components/dropzone";
import { XCircle, RefreshCw, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface CategoryCount {
  name: string;
  value: number;
}

interface AnalysisResult {
  rows_processed: number;
  top_categories: CategoryCount[];
}

export default function Home() {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AnalysisResult>({ rows_processed: 0, top_categories: [] });
  const [targetCol, setTargetCol] = useState(2);

  const fileRef = useRef<File | null>(null);
  const offsetRef = useRef(0);
  const CHUNK_SIZE = 10 * 1024 * 1024;

  const setupWorker = useCallback(() => {

    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const worker = new Worker(new URL("../workers/compute.worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { status, result, stats: newStats, error } = event.data;

      if (status === "progress") {
        if (newStats) setStats(newStats);
        if (fileRef.current) {
          const percent = (offsetRef.current / fileRef.current.size) * 100;
          setProgress(percent);
        }
      } else if (status === "chunk_ack") {
        readNextChunk();
      } else if (status === "complete") {
        if (result.includes("🦀")) {
          setLogs(prev => [...prev, `✅ ${result}`]);
        } else {
          setStatus("Done");
          setIsProcessing(false);
          setProgress(100);
        }
      } else if (status === "error") {

        setError(error);
        setIsProcessing(false);
        setStatus("Error");
      }
    };


    worker.postMessage({ action: "init_wasm" });
  }, []);

  useEffect(() => {
    setupWorker();
    return () => workerRef.current?.terminate();
  }, [setupWorker]);

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
    setError(null);
    setLogs(prev => [...prev, `📄 Processing: ${file.name}`]);

    fileRef.current = file;
    offsetRef.current = 0;

    setIsProcessing(true);
    setProgress(0);
    setStats({ rows_processed: 0, top_categories: [] });
    setStatus("Crunching...");

    workerRef.current?.postMessage({ action: "start_stream", columnIndex: targetCol });
    readNextChunk();
  };

  const handleCancel = () => {
    setStatus("Cancelled by user");
    setIsProcessing(false);
    setProgress(0);
    setLogs(prev => [...prev, "Operation Cancelled"]);
    setupWorker();
  };


  const handleReset = () => {
    setStats({ rows_processed: 0, top_categories: [] });
    setLogs([]);
    setStatus("Ready");
    setError(null);
    setProgress(0);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-12 font-mono flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-8">

        <header className="border-b border-neutral-800 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">LocalCrunch v1.1</h1>
            <p className="text-neutral-500">Rust + WASM + WebWorkers</p>
          </div>
          <div className={`px-3 py-1 rounded text-sm font-bold ${status === "Error" ? "bg-red-500/20 text-red-400" :
              status === "Done" ? "bg-green-500/20 text-green-400" :
                "bg-neutral-800 text-neutral-400"
            }`}>
            {status}
          </div>
        </header>

        <div className="relative">
          <Dropzone onFileSelect={handleFileSelect} isProcessing={isProcessing} />

          {error && (
            <div className="absolute inset-0 bg-neutral-950/90 flex flex-col items-center justify-center text-red-400 z-10 rounded-lg border border-red-900/50">
              <AlertCircle className="w-12 h-12 mb-2" />
              <p>Error: {error}</p>
              <button onClick={handleReset} className="mt-4 px-4 py-2 bg-red-900/50 hover:bg-red-900/80 rounded text-white text-sm">
                Dismiss
              </button>
            </div>
          )}
        </div>

        <div className="bg-neutral-900 p-4 rounded border border-neutral-800 col-span-2 h-64">
          <div className="text-neutral-500 text-xs uppercase mb-4 flex justify-between">
            <span>Top 5 Values in Column {targetCol}</span>
            {/* Simple Column Selector */}
            <input
              type="number"
              value={targetCol}
              onChange={(e) => setTargetCol(Number(e.target.value))}
              className="bg-neutral-800 text-white text-xs p-1 rounded w-16 text-center"
              disabled={isProcessing}
            />
          </div>

          <ResponsiveContainer width="100%" height="80%">
            <BarChart data={stats.top_categories} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#171717', border: '1px solid #404040' }}
                itemStyle={{ color: '#fff' }}
              />
              <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]}>
                {stats.top_categories.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? '#3B82F6' : '#1D4ED8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="h-16 flex items-center justify-between gap-4 bg-neutral-900/30 p-4 rounded-lg border border-neutral-800/50">
          <div className="flex-1 mr-4">
            <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ease-out ${error ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {isProcessing ? (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition-colors text-sm font-bold border border-red-500/20"
            >
              <XCircle className="w-4 h-4" /> Cancel
            </button>
          ) : (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors text-sm font-bold"
            >
              <RefreshCw className="w-4 h-4" /> Reset
            </button>
          )}
        </div>

        <div className="bg-black border border-neutral-800 rounded-lg p-4 h-40 overflow-y-auto text-xs font-mono shadow-inner opacity-70">
          {logs.map((log, i) => (
            <div key={i} className="mb-1 text-neutral-500 border-b border-neutral-900/50 pb-1 last:border-0">
              {log}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}