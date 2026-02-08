"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Dropzone } from "@/components/dropzone";
import { 
  Table as TableIcon, 
  Play, 
  FileJson, 
  Hash, 
  Type, 
  Calendar, 
  CheckSquare, 
  Activity, 
  RefreshCw,
  Cpu
} from "lucide-react";

type ColType = "Null" | "Boolean" | "Integer" | "Float" | "Date" | "String";

interface SchemaColumn {
  name: string;
  col_type: ColType;
}

interface PreviewResult {
  schema: SchemaColumn[];
  rows: (string | null)[][];
}

interface ColumnStats {
  col_index: number;
  total_count: number;
  null_count: number;
  min: number;
  max: number;
  mean: number;
  m2: number;
  numeric_count: number;
}

interface AnalysisResult {
  rows_processed: number;
  columns: ColumnStats[];
}

export default function Home() {
  const workerRef = useRef<Worker | null>(null);
  
    const [file, setFile] = useState<File | null>(null);
  
    const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [columns, setColumns] = useState<SchemaColumn[]>([]);   const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
    const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [throughput, setThroughput] = useState(0);

    const offsetRef = useRef(0);
  const lastTickRef = useRef<number>(Date.now());
  const lastBytesRef = useRef<number>(0);
  const CHUNK_SIZE = 10 * 1024 * 1024; 

    const setupWorker = useCallback(() => {
    if (workerRef.current) workerRef.current.terminate();
    
    const worker = new Worker(new URL("../workers/compute.worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { status, result, stats } = event.data;

      if (status === "preview_ready") {
        setPreview(result);
        setColumns(result.schema);         setIsLoadingPreview(false);
      }
      else if (status === "progress") {
        if (stats) setAnalysis(stats);
        
        if (file) {
          const currentBytes = offsetRef.current;
          const percent = (currentBytes / file.size) * 100;
          setProgress(percent);

          const now = Date.now();
          if (now - lastTickRef.current > 500) {
            const deltaBytes = currentBytes - lastBytesRef.current;
            const deltaSec = (now - lastTickRef.current) / 1000;
            const mbs = deltaBytes / 1024 / 1024 / deltaSec;
            
            setThroughput(mbs);
            lastTickRef.current = now;
            lastBytesRef.current = currentBytes;
          }
        }
      } 
      else if (status === "chunk_ack") {
        readNextChunk();
      } 
      else if (status === "complete") {
        setIsProcessing(false);
        setProgress(100);
      }
    };

    worker.postMessage({ action: "init_wasm" });
  }, [file]);

  useEffect(() => { setupWorker(); }, [setupWorker]);

      
  const handleFileDrop = (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoadingPreview(true);
    setAnalysis(null);
    setIsProcessing(false);
    setProgress(0);

    const chunk = selectedFile.slice(0, 1024 * 1024);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && workerRef.current) {
        workerRef.current.postMessage({ 
          action: "sniff_preview", 
          chunk: e.target.result 
        }, [e.target.result as ArrayBuffer]);
      }
    };
    reader.readAsArrayBuffer(chunk);
  };

  const handleStartAnalysis = () => {
    if (!columns.length || !file) return;

    setPreview(null);     setIsProcessing(true);
    offsetRef.current = 0;
    lastBytesRef.current = 0;
    lastTickRef.current = Date.now();

    workerRef.current?.postMessage({ 
      action: "start_stream", 
      columnCount: columns.length 
    });

    readNextChunk();
  };

  const readNextChunk = () => {
    const f = file;
    const worker = workerRef.current;
    if (!f || !worker) return;

    if (offsetRef.current >= f.size) {
      worker.postMessage({ action: "end_stream" });
      return;
    }

    const chunk = f.slice(offsetRef.current, offsetRef.current + CHUNK_SIZE);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        worker.postMessage({ action: "chunk", chunk: e.target.result }, [e.target.result as ArrayBuffer]);
        offsetRef.current += CHUNK_SIZE;
      }
    };
    reader.readAsArrayBuffer(chunk);
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setAnalysis(null);
    setColumns([]);
    setIsProcessing(false);
    setupWorker(); 
  };

  const TypeBadge = ({ type }: { type: ColType }) => {
    switch(type) {
        case "Integer": return <span className="flex items-center gap-1 text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold"><Hash className="w-3 h-3"/> INT</span>
        case "Float": return <span className="flex items-center gap-1 text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold"><Hash className="w-3 h-3"/> DEC</span>
        case "String": return <span className="flex items-center gap-1 text-neutral-400 bg-neutral-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold"><Type className="w-3 h-3"/> STR</span>
        case "Date": return <span className="flex items-center gap-1 text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold"><Calendar className="w-3 h-3"/> DATE</span>
        case "Boolean": return <span className="flex items-center gap-1 text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold"><CheckSquare className="w-3 h-3"/> BOOL</span>
        default: return <span className="text-neutral-600 text-[10px]">NULL</span>
    }
  };

  const StatCard = ({ colName, stats, type }: { colName: string, stats: ColumnStats, type: string }) => {
    const isNumeric = stats.numeric_count > 0 && type !== "String";
    const validCount = stats.total_count - stats.null_count;
    const fillPercent = stats.total_count > 0 ? (validCount / stats.total_count) * 100 : 0;
    
    const stdDev = stats.numeric_count > 1 
        ? Math.sqrt(stats.m2 / (stats.numeric_count - 1)) 
        : 0;

    return (
      <div className="bg-[#111] border border-neutral-800 rounded-lg p-4 flex flex-col gap-3 min-w-[200px] hover:border-neutral-700 transition-colors">
         <div className="flex justify-between items-start">
            <h3 className="font-bold text-neutral-200 truncate w-32 text-sm" title={colName}>{colName}</h3>
            <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400">{type}</span>
         </div>

         <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full ${fillPercent < 90 ? 'bg-yellow-600' : 'bg-green-600'}`} style={{ width: `${fillPercent}%` }} />
         </div>
         <div className="flex justify-between text-[10px] text-neutral-500">
            <span>{validCount.toLocaleString()} valid</span>
            <span>{stats.null_count.toLocaleString()} nulls</span>
         </div>

         {isNumeric ? (
             <div className="grid grid-cols-2 gap-2 mt-2">
                 <div className="bg-neutral-900/50 p-2 rounded border border-neutral-800/50">
                    <span className="text-[10px] text-neutral-500 block uppercase">Min</span>
                    <span className="text-xs font-mono text-blue-300">{stats.min.toFixed(2)}</span>
                 </div>
                 <div className="bg-neutral-900/50 p-2 rounded border border-neutral-800/50">
                    <span className="text-[10px] text-neutral-500 block uppercase">Max</span>
                    <span className="text-xs font-mono text-blue-300">{stats.max.toFixed(2)}</span>
                 </div>
                 <div className="col-span-2 bg-neutral-900/50 p-2 rounded border border-neutral-800/50 flex justify-between items-center">
                    <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">Avg</span>
                        <span className="text-xs font-mono text-green-300">{stats.mean.toFixed(2)}</span>
                    </div>
                    <div className="text-right">
                        <span className="text-[10px] text-neutral-500 block uppercase">Std Dev</span>
                        <span className="text-xs font-mono text-neutral-400">{stdDev.toFixed(2)}</span>
                    </div>
                 </div>
             </div>
         ) : (
             <div className="mt-auto pt-4 text-center">
                 <span className="text-[10px] text-neutral-600 italic px-2 py-1 border border-dashed border-neutral-800 rounded">
                     Categorical Data
                 </span>
             </div>
         )}
      </div>
    );
  };

      
  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-200 font-sans p-8 flex flex-col items-center">
      <div className="w-full max-w-7xl space-y-6">
        
        <div className="border-b border-neutral-800 pb-6 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20">
                    <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">LocalCrunch <span className="text-neutral-500 text-sm font-normal">v2.0</span></h1>
                    <p className="text-neutral-500 text-xs">Welford's Online Algorithm Engine</p>
                </div>
            </div>

            {(preview || isProcessing || analysis) && (
                <button 
                    onClick={handleReset}
                    className="text-xs text-neutral-500 hover:text-white flex items-center gap-2 px-3 py-1.5 rounded hover:bg-neutral-800 transition-colors"
                >
                    <RefreshCw className="w-3 h-3" /> Reset
                </button>
            )}
        </div>

        {!file && (
            <div className="max-w-2xl mx-auto w-full pt-12">
                <Dropzone onFileSelect={handleFileDrop} isProcessing={false} />
            </div>
        )}

        {isLoadingPreview && (
            <div className="h-64 flex flex-col items-center justify-center text-neutral-500 animate-pulse">
                <FileJson className="w-12 h-12 mb-4 opacity-50" />
                <p>Sniffing schema & inferring types...</p>
            </div>
        )}

        {preview && !isLoadingPreview && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between bg-neutral-900/50 p-4 rounded-lg border border-neutral-800">
                    <div>
                        <h2 className="text-white font-medium">{file?.name}</h2>
                        <p className="text-xs text-neutral-500">{preview.schema.length} Columns detected</p>
                    </div>
                    <button 
                        onClick={handleStartAnalysis}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-md text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-900/20 transition-all hover:scale-105"
                    >
                        <Play className="w-4 h-4" /> Run Full Analysis
                    </button>
                </div>

                <div className="border border-neutral-800 rounded-lg overflow-hidden bg-[#0c0c0c]">
                    <div className="overflow-x-auto max-h-[400px]">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-[#111] sticky top-0 z-10 shadow-sm">
                                <tr>
                                    {preview.schema.map((col, i) => (
                                        <th key={i} className="px-4 py-3 border-b border-neutral-800 font-medium text-neutral-400 text-xs">
                                            <div className="flex items-center gap-2">
                                                {col.name}
                                                <TypeBadge type={col.col_type} />
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800/50">
                                {preview.rows.map((row, r_idx) => (
                                    <tr key={r_idx} className="hover:bg-neutral-900/50 transition-colors">
                                        {row.map((cell, c_idx) => (
                                            <td key={c_idx} className="px-4 py-2 text-neutral-300 font-mono text-xs border-r border-transparent last:border-0">
                                                {cell === null ? <span className="text-neutral-700 italic">null</span> : cell}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {(isProcessing || analysis) && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-[#111] p-4 rounded border border-neutral-800 flex items-center justify-between">
                         <div>
                            <span className="text-[10px] text-neutral-500 uppercase font-bold">Throughput</span>
                            <div className="text-2xl font-bold text-white flex items-baseline gap-1">
                                {throughput.toFixed(1)} <span className="text-xs text-neutral-600 font-normal">MB/s</span>
                            </div>
                         </div>
                         <Cpu className="w-5 h-5 text-neutral-700" />
                    </div>
                    
                    <div className="col-span-3 bg-[#111] p-4 rounded border border-neutral-800 relative overflow-hidden flex flex-col justify-center">
                        <div className="flex justify-between text-xs text-neutral-400 mb-2 z-10 relative">
                            <span className="flex items-center gap-2"><Activity className="w-3 h-3"/> Processing Rows...</span>
                            <span>{analysis?.rows_processed.toLocaleString()} rows</span>
                        </div>
                        <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden z-10 relative">
                            <div className="h-full bg-blue-600 transition-all duration-200" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                </div>
                {analysis && columns.length > 0 && (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {analysis.columns.map((colStats, i) => (
                            <StatCard 
                                key={i} 
                                colName={columns[i]?.name || `Col ${i}`} 
                                type={columns[i]?.col_type || "Unknown"}
                                stats={colStats} 
                            />
                        ))}
                     </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
}