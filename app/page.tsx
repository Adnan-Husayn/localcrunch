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
  Cpu,
  BarChart2
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  Cell, 
  Tooltip, 
  ResponsiveContainer,
  XAxis
} from 'recharts';


type ColType = "Null" | "Boolean" | "Integer" | "Float" | "Date" | "String";

interface SchemaColumn {
  name: string;
  col_type: ColType;
}

interface PreviewResult {
  schema: SchemaColumn[];
  rows: (string | null)[][];
}

interface CategoryCount {
  name: string;
  value: number;
}

interface HistogramBin {
  range_start: number;
  range_end: number;
  count: number;
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
  
    top_categories: CategoryCount[];
  unique_count_approx: number;
  is_high_cardinality: boolean;

    histogram: HistogramBin[];
}

interface AnalysisResult {
  rows_processed: number;
  columns: ColumnStats[];
}


export default function Home() {
  const workerRef = useRef<Worker | null>(null);
  
    const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<SchemaColumn[]>([]);   
    const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
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
        setColumns(result.schema);
        setIsLoadingPreview(false);
      }

            else if (status === "progress") {
        if (stats) setAnalysis(stats);
        
        if (file) {
          const currentBytes = offsetRef.current;
                    const percent = Math.min(99, (currentBytes / file.size) * 100);
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
    const styles = {
      Integer: "text-blue-400 bg-blue-400/10",
      Float: "text-cyan-400 bg-cyan-400/10",
      String: "text-neutral-400 bg-neutral-400/10",
      Date: "text-purple-400 bg-purple-400/10",
      Boolean: "text-green-400 bg-green-400/10",
      Null: "text-neutral-600 bg-neutral-800",
    };
    
    const icons = {
      Integer: <Hash className="w-3 h-3"/>,
      Float: <Hash className="w-3 h-3"/>,
      String: <Type className="w-3 h-3"/>,
      Date: <Calendar className="w-3 h-3"/>,
      Boolean: <CheckSquare className="w-3 h-3"/>,
      Null: null,
    };

    return (
      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${styles[type] || styles.Null}`}>
        {icons[type]} {type === "Integer" ? "INT" : type === "Float" ? "DEC" : type === "String" ? "STR" : type.toUpperCase()}
      </span>
    );
  };

  const StatCard = ({ colName, stats, type }: { colName: string, stats: ColumnStats, type: string }) => {
    const isNumeric = stats.numeric_count > 0 && type !== "String";
    const validCount = stats.total_count - stats.null_count;
    const fillPercent = stats.total_count > 0 ? (validCount / stats.total_count) * 100 : 0;
    
        const stdDev = stats.numeric_count > 1 ? Math.sqrt(stats.m2 / (stats.numeric_count - 1)) : 0;

    return (
      <div className="bg-[#111] border border-neutral-800 rounded-lg p-4 flex flex-col gap-3 min-w-[200px] hover:border-neutral-700 transition-colors h-full">
         <div className="flex justify-between items-start">
            <h3 className="font-bold text-neutral-200 truncate w-32 text-sm" title={colName}>{colName}</h3>
            <TypeBadge type={type as ColType} />
         </div>

         {/* Health Bar */}
         <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full ${fillPercent < 90 ? 'bg-yellow-600' : 'bg-green-600'}`} style={{ width: `${fillPercent}%` }} />
         </div>
         <div className="flex justify-between text-[10px] text-neutral-500">
            <span>{validCount.toLocaleString()} valid</span>
            <span>{stats.null_count.toLocaleString()} nulls</span>
         </div>

         {/* MODE A: NUMERIC STATS + HISTOGRAM */}
         {isNumeric ? (
             <div className="flex flex-col gap-2 mt-2 flex-1">
                 <div className="grid grid-cols-2 gap-2">
                     <div className="bg-neutral-900/50 p-2 rounded border border-neutral-800/50">
                        <span className="text-[10px] text-neutral-500 block uppercase">Min</span>
                        <span className="text-xs font-mono text-blue-300">{stats.min.toFixed(2)}</span>
                     </div>
                     <div className="bg-neutral-900/50 p-2 rounded border border-neutral-800/50">
                        <span className="text-[10px] text-neutral-500 block uppercase">Max</span>
                        <span className="text-xs font-mono text-blue-300">{stats.max.toFixed(2)}</span>
                     </div>
                 </div>

                 {/* HISTOGRAM CHART */}
                 <div className="flex-1 min-h-[60px] w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.histogram}>
                            <Tooltip 
                                cursor={{fill: 'transparent'}}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-black border border-neutral-800 p-2 rounded text-[10px] shadow-xl">
                                                <p className="text-neutral-400 mb-1">Range: <span className="text-white">{data.range_start.toFixed(1)} - {data.range_end.toFixed(1)}</span></p>
                                                <p className="text-blue-400 font-bold">Count: {data.count}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]}>
                                {stats.histogram.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fillOpacity={0.5 + (entry.count / (stats.histogram.reduce((a,b)=> Math.max(a, b.count),0) || 1)) * 0.5} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                 </div>

                 <div className="flex justify-between items-center text-[10px] text-neutral-500 pt-2 border-t border-neutral-800/50 mt-auto">
                    <span>Avg: <span className="text-green-400">{stats.mean.toFixed(2)}</span></span>
                    <span>σ: <span className="text-neutral-300">{stdDev.toFixed(2)}</span></span>
                 </div>
             </div>
         ) : (
             /* MODE B: CATEGORICAL TOP-K */
             <div className="mt-2 space-y-2 flex-1 flex flex-col">
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">Top Values</span>
                    {stats.is_high_cardinality && (
                        <span className="text-[9px] text-yellow-500 bg-yellow-500/10 px-1 rounded border border-yellow-500/20">High Cardinality</span>
                    )}
                 </div>
                 
                 <div className="space-y-1.5 flex-1">
                    {stats.top_categories.map((cat, idx) => {
                        const percent = validCount > 0 ? (cat.value / validCount) * 100 : 0;
                        return (
                            <div key={idx} className="relative h-6 flex items-center group">
                                <div className="absolute inset-0 bg-neutral-900 rounded overflow-hidden">
                                    <div className="h-full bg-blue-900/40 group-hover:bg-blue-800/50 transition-colors" style={{ width: `${percent}%` }} />
                                </div>
                                <div className="relative z-10 flex justify-between w-full px-2 text-[10px]">
                                    <span className="text-neutral-300 truncate w-24" title={cat.name}>{cat.name}</span>
                                    <span className="text-neutral-500 font-mono">{percent.toFixed(0)}%</span>
                                </div>
                            </div>
                        )
                    })}
                    {stats.top_categories.length === 0 && (
                        <div className="text-center text-[10px] text-neutral-600 py-4 border border-dashed border-neutral-800 rounded">
                            No values found
                        </div>
                    )}
                 </div>
             </div>
         )}
      </div>
    );
  };

      
  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-200 font-sans p-8 flex flex-col items-center">
      <div className="w-full max-w-[1400px] space-y-6">
        
        {/* Header */}
        <div className="border-b border-neutral-800 pb-6 flex justify-between items-center sticky top-0 bg-[#09090b]/95 backdrop-blur z-20">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20">
                    <BarChart2 className="w-5 h-5 text-white" />
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

        {/* STATE 1: NO FILE */}
        {!file && (
            <div className="max-w-2xl mx-auto w-full pt-12">
                <Dropzone onFileSelect={handleFileDrop} isProcessing={false} />
            </div>
        )}

        {/* STATE 2: LOADING PREVIEW */}
        {isLoadingPreview && (
            <div className="h-64 flex flex-col items-center justify-center text-neutral-500 animate-pulse">
                <FileJson className="w-12 h-12 mb-4 opacity-50" />
                <p>Sniffing schema & inferring types...</p>
            </div>
        )}

        {/* STATE 3: PREVIEW MODE */}
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
                    <div className="overflow-x-auto max-h-[500px]">
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

        {/* STATE 4: ANALYSIS DASHBOARD */}
        {(isProcessing || analysis) && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-20">
                
                {/* Telemetry Bar */}
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
                            <div className="h-full bg-blue-600 transition-all duration-200 ease-linear" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                </div>

                {/* Main Stat Grid */}
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