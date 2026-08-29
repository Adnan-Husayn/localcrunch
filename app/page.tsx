"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Dropzone } from "@/components/dropzone";
import {
    Play,
    FileJson,
    Hash,
    Type,
    Calendar,
    CheckSquare,
    Activity,
    RefreshCw,
    Cpu,
    BarChart2,
    XCircle
} from "lucide-react";
import {
    BarChart,
    Bar,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { motion } from "framer-motion";


type ColType = "Null" | "Boolean" | "Integer" | "Float" | "Date" | "String";

interface Filter {
    col_index: number;
    operator: string;
    value: string;
}

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

const TypeBadge = ({ type }: { type: ColType }) => {
    const styles = {
        Integer: "text-blue-400 bg-blue-500/10 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]",
        Float: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]",
        String: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
        Date: "text-purple-400 bg-purple-500/10 border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]",
        Boolean: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]",
        Null: "text-neutral-500 bg-neutral-800/50 border-neutral-700/50",
    };

    const icons = {
        Integer: <Hash className="w-3 h-3" />,
        Float: <Hash className="w-3 h-3" />,
        String: <Type className="w-3 h-3" />,
        Date: <Calendar className="w-3 h-3" />,
        Boolean: <CheckSquare className="w-3 h-3" />,
        Null: null,
    };

    return (
        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide uppercase ${styles[type] || styles.Null}`}>
            {icons[type]} {type === "Integer" ? "INT" : type === "Float" ? "DEC" : type === "String" ? "STR" : type}
        </span>
    );
};


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
    const [activeFilters, setActiveFilters] = useState<Filter[]>([]);
    
    // Split pane layout state
    const [selectedColumnIndex, setSelectedColumnIndex] = useState(0);

    const offsetRef = useRef(0);
    const lastTickRef = useRef<number>(0);
    const lastBytesRef = useRef<number>(0);
    const CHUNK_SIZE = 10 * 1024 * 1024;

    const addFilter = () => {
        setActiveFilters([...activeFilters, { col_index: 0, operator: "contains", value: "" }]);
    };

    const readNextChunk = useCallback(() => {
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
    }, [file, CHUNK_SIZE]);

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
    }, [file, readNextChunk]);

    useEffect(() => { 
        lastTickRef.current = Date.now();
        setupWorker(); 
    }, [setupWorker]);


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

        setPreview(null); setIsProcessing(true);
        offsetRef.current = 0;
        lastBytesRef.current = 0;
        lastTickRef.current = Date.now();

        workerRef.current?.postMessage({
            action: "start_stream",
            columnCount: columns.length,
            filters: activeFilters
        });

        readNextChunk();
    };

    const handleReset = () => {
        setFile(null);
        setPreview(null);
        setAnalysis(null);
        setColumns([]);
        setIsProcessing(false);
        setupWorker();
    };





    return (
        <div className="min-h-screen bg-[#09090b] text-zinc-200 font-sans p-4 md:p-8 flex flex-col items-center selection:bg-blue-500/30">
            <div className="w-full max-w-[1400px] space-y-8 relative">

                {/* Decorative Background Blob */}
                <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none z-0" />
                <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none z-0" />

                {/* Floating Navbar */}
                <motion.nav 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="fixed top-0 left-0 right-0 z-50 flex justify-center py-4 pointer-events-none"
                >
                    <div className="bg-[#0c0c0e]/80 backdrop-blur-2xl border border-white/5 shadow-2xl rounded-2xl p-3 px-6 w-full max-w-5xl mx-4 flex items-center justify-between pointer-events-auto">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.3)] border border-blue-400/20">
                                <BarChart2 className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 tracking-tight leading-none">
                                    LocalCrunch <span className="text-blue-500 text-[10px] font-bold tracking-normal ml-1 border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 rounded-full align-middle">v2.0</span>
                                </h1>
                                <p className="text-[10px] text-zinc-500 font-medium tracking-widest uppercase mt-0.5">Welford&apos;s Engine</p>
                            </div>
                        </div>

                        {(preview || isProcessing || analysis) && (
                            <button
                                onClick={handleReset}
                                className="text-xs text-zinc-400 hover:text-white flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all font-medium"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Reset
                            </button>
                        )}
                    </div>
                </motion.nav>

                {/* Main Content padding spacer for fixed nav */}
                <div className="pt-24" />

                {/* STATE 1: NO FILE */}
                <div className="w-full relative transition-opacity duration-300">
                    {!file && (
                        <div className="max-w-2xl mx-auto w-full pt-16 z-10 relative fade-in">
                            <Dropzone onFileSelect={handleFileDrop} isProcessing={false} />
                        </div>
                    )}

                    {/* STATE 2: LOADING PREVIEW */}
                    {isLoadingPreview && (
                        <div className="h-64 flex flex-col items-center justify-center text-zinc-500 z-10 relative fade-in">
                            <div className="animate-pulse">
                                <FileJson className="w-16 h-16 mb-6 text-blue-500/50 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]" />
                            </div>
                            <p className="text-sm font-medium tracking-wide">Inferring schema & types at lightspeed...</p>
                        </div>
                    )}

                    {/* STATE 3: PREVIEW MODE */}
                    {preview && !isLoadingPreview && (
                        <div className="space-y-6 z-10 relative fade-in">
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
                                <div className="bg-neutral-900/50 p-4 rounded-lg border border-neutral-800 mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-bold text-neutral-400 uppercase">Filters</h3>
                                        <button onClick={addFilter} className="text-xs bg-neutral-800 px-2 py-1 rounded hover:bg-neutral-700 text-neutral-300">
                                            + Add Filter
                                        </button>
                                    </div>

                                    {activeFilters.length === 0 && (
                                        <p className="text-xs text-neutral-600 italic">No filters active. analyzing full dataset.</p>
                                    )}

                                    <div className="space-y-2">
                                        {activeFilters.map((filter, idx) => (
                                            <div key={idx} className="flex gap-2 items-center">
                                                {/* Column Selector */}
                                                <select
                                                    className="bg-neutral-950 border border-neutral-800 text-xs text-white p-1.5 rounded w-32"
                                                    value={filter.col_index}
                                                    onChange={(e) => {
                                                        const newFilters = [...activeFilters];
                                                        newFilters[idx].col_index = Number(e.target.value);
                                                        setActiveFilters(newFilters);
                                                    }}
                                                >
                                                    {columns.map((col, i) => <option key={i} value={i}>{col.name}</option>)}
                                                </select>

                                                {/* Operator Selector */}
                                                <select
                                                    className="bg-neutral-950 border border-neutral-800 text-xs text-white p-1.5 rounded w-24"
                                                    value={filter.operator}
                                                    onChange={(e) => {
                                                        const newFilters = [...activeFilters];
                                                        newFilters[idx].operator = e.target.value;
                                                        setActiveFilters(newFilters);
                                                    }}
                                                >
                                                    <option value="contains">contains</option>
                                                    <option value="==">equals</option>
                                                    <option value="!=">not equals</option>
                                                    <option value=">">&gt;</option>
                                                    <option value="<">&lt;</option>
                                                </select>

                                                {/* Value Input */}
                                                <input
                                                    type="text"
                                                    className="bg-neutral-950 border border-neutral-800 text-xs text-white p-1.5 rounded flex-1"
                                                    placeholder="Value..."
                                                    value={filter.value}
                                                    onChange={(e) => {
                                                        const newFilters = [...activeFilters];
                                                        newFilters[idx].value = e.target.value;
                                                        setActiveFilters(newFilters);
                                                    }}
                                                />

                                                {/* Remove Button */}
                                                <button
                                                    onClick={() => {
                                                        const newFilters = activeFilters.filter((_, i) => i !== idx);
                                                        setActiveFilters(newFilters);
                                                    }}
                                                    className="text-neutral-500 hover:text-red-400"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-[#0f0f12] sticky top-0 z-10 shadow-md">
                                        <tr>
                                            {preview.schema.map((col, i) => (
                                                <th key={i} className="px-5 py-4 border-b border-neutral-800 font-semibold text-zinc-300 text-xs uppercase tracking-wider">
                                                    <div className="flex items-center gap-3">
                                                        {col.name}
                                                        <TypeBadge type={col.col_type} />
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-900">
                                        {preview.rows.map((row, r_idx) => (
                                            <tr key={r_idx} className="hover:bg-neutral-950 transition-colors">
                                                {row.map((cell, c_idx) => (
                                                    <td key={c_idx} className="px-5 py-2.5 text-zinc-400 font-mono text-xs border-r border-transparent last:border-0">
                                                        {cell === null ? <span className="text-zinc-600 italic">null</span> : cell}
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
                </div>

                {/* STATE 4: ANALYSIS DASHBOARD */}
                <div className="w-full relative fade-in">
                    {(isProcessing || analysis) && (
                        <div className="space-y-6 pb-20 z-10 relative">

                            {/* Telemetry Bar */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-neutral-900/40 backdrop-blur border border-blue-500/20 p-5 rounded-2xl flex items-center justify-between shadow-[0_0_30px_rgba(59,130,246,0.05)] relative overflow-hidden transition-all duration-300">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 blur-xl pointer-events-none" />
                                    <div>
                                        <span className="text-[10px] text-blue-400 uppercase font-bold tracking-widest">Throughput</span>
                                        <div className="text-3xl font-black text-white flex items-baseline gap-1 mt-1 font-mono">
                                            {throughput.toFixed(1)} <span className="text-xs text-zinc-500 font-medium font-sans uppercase">MB/s</span>
                                        </div>
                                    </div>
                                    <div className={`transition-transform duration-1000 ${isProcessing ? 'rotate-[360deg]' : ''}`}>
                                        <Cpu className="w-8 h-8 text-blue-500/50" />
                                    </div>
                                </div>

                                <div className="col-span-3 bg-neutral-900/40 backdrop-blur border border-neutral-800 p-5 rounded-2xl relative overflow-hidden flex flex-col justify-center">
                                    <div className="flex justify-between text-xs text-zinc-400 mb-3 z-10 relative font-medium">
                                        <span className="flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> Processing Streaming Rows...</span>
                                        <span className="font-mono text-white bg-black/50 px-2 py-1 rounded">{analysis?.rows_processed.toLocaleString()} rows</span>
                                    </div>
                                    <div className="h-3 w-full bg-black/50 rounded-full overflow-hidden z-10 relative shadow-inner border border-neutral-800">
                                        <div 
                                            style={{ width: `${progress}%` }}
                                            className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] transition-all duration-100" 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Split Pane Explorer */}
                            {analysis && columns.length > 0 && (
                                <div className="flex flex-col lg:flex-row gap-6 mt-8">
                                    <div className="w-full lg:w-80 flex-shrink-0 bg-[#0c0c0e]/80 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden flex flex-col h-[700px] shadow-2xl">
                                        <div className="p-5 border-b border-white/5 bg-white/5">
                                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Dataset Columns</h3>
                                        </div>
                                        <div className="overflow-y-auto flex-1 custom-scrollbar p-3 space-y-2">
                                            {columns.map((col, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setSelectedColumnIndex(idx)}
                                                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all duration-200 ${selectedColumnIndex === idx ? 'bg-blue-500/10 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'hover:bg-white/5 border border-transparent'}`}
                                                >
                                                    <span className={`font-medium truncate mr-3 ${selectedColumnIndex === idx ? 'text-blue-400 text-sm' : 'text-zinc-300 text-xs'}`}>{col.name}</span>
                                                    <div className="flex-shrink-0">
                                                        <TypeBadge type={col.col_type} />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex-1 bg-[#0c0c0e]/60 backdrop-blur-md border border-white/5 rounded-2xl p-6 min-h-[700px] shadow-2xl overflow-y-auto custom-scrollbar">
                                        {/* Detail View Rendered Here */}
                                        {analysis.columns[selectedColumnIndex] && (
                                            <div className="space-y-8 fade-in">
                                                <div className="border-b border-white/5 pb-4">
                                                    <div className="flex items-center gap-4 mb-2">
                                                        <h2 className="text-3xl font-black text-white tracking-tight">{columns[selectedColumnIndex].name}</h2>
                                                        <TypeBadge type={columns[selectedColumnIndex].col_type} />
                                                    </div>
                                                    <div className="flex items-center gap-6 text-sm">
                                                        <span className="text-zinc-500 font-mono">Total: <span className="text-white">{analysis.columns[selectedColumnIndex].total_count.toLocaleString()}</span></span>
                                                        <span className="text-zinc-500 font-mono">Nulls: <span className="text-red-400">{analysis.columns[selectedColumnIndex].null_count.toLocaleString()}</span></span>
                                                        <span className="text-zinc-500 font-mono">Present: <span className="text-emerald-400">{(analysis.columns[selectedColumnIndex].total_count - analysis.columns[selectedColumnIndex].null_count).toLocaleString()}</span></span>
                                                    </div>
                                                </div>

                                                {/* Numeric Stats View */}
                                                {(columns[selectedColumnIndex].col_type === "Integer" || columns[selectedColumnIndex].col_type === "Float") && (
                                                    <div className="space-y-6">
                                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                                            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                                                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Minimum</span>
                                                                <div className="text-xl font-mono text-white mt-1">{analysis.columns[selectedColumnIndex].min.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                                            </div>
                                                            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                                                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Maximum</span>
                                                                <div className="text-xl font-mono text-white mt-1">{analysis.columns[selectedColumnIndex].max.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                                            </div>
                                                            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                                                <span className="text-[10px] text-blue-400 uppercase tracking-widest font-bold">Mean</span>
                                                                <div className="text-xl font-mono text-blue-100 mt-1">{analysis.columns[selectedColumnIndex].mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                                            </div>
                                                            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                                                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Zeros</span>
                                                                <div className="text-xl font-mono text-white mt-1">Approx</div>
                                                            </div>
                                                        </div>

                                                        {analysis.columns[selectedColumnIndex].histogram.length > 0 && (
                                                            <div className="h-[350px] bg-black/20 rounded-xl p-4 border border-white/5">
                                                                <ResponsiveContainer width="100%" height="100%">
                                                                    <BarChart data={analysis.columns[selectedColumnIndex].histogram} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                                                        <defs>
                                                                            <linearGradient id="histGradientLarge" x1="0" y1="0" x2="0" y2="1">
                                                                                <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.9} />
                                                                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                                            </linearGradient>
                                                                        </defs>
                                                                        <Tooltip
                                                                            cursor={{ fill: '#ffffff0a' }}
                                                                            content={({ active, payload }) => {
                                                                                if (active && payload && payload.length) {
                                                                                    const data = payload[0].payload;
                                                                                    return (
                                                                                        <div className="bg-[#0c0c0e]/95 border border-white/10 p-3 rounded-lg shadow-2xl backdrop-blur-xl">
                                                                                            <p className="text-xs text-zinc-400 font-mono mb-1.5 border-b border-white/10 pb-1.5">{data.range_start.toFixed(1)} - {data.range_end.toFixed(1)}</p>
                                                                                            <p className="text-sm font-bold text-white flex justify-between gap-4">Count: <span className="text-blue-400 font-mono">{data.count.toLocaleString()}</span></p>
                                                                                        </div>
                                                                                    );
                                                                                }
                                                                                return null;
                                                                            }}
                                                                        />
                                                                        <Bar dataKey="count" fill="url(#histGradientLarge)" radius={[4, 4, 0, 0]} />
                                                                    </BarChart>
                                                                </ResponsiveContainer>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Categorical Stats View */}
                                                {(columns[selectedColumnIndex].col_type === "String" || columns[selectedColumnIndex].col_type === "Boolean" || columns[selectedColumnIndex].col_type === "Date") && (
                                                    <div className="space-y-6">
                                                        <div className="bg-white/5 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                                                            <div>
                                                                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Unique Values (Approx)</span>
                                                                <div className="text-2xl font-mono text-white mt-1">{analysis.columns[selectedColumnIndex].unique_count_approx.toLocaleString()}</div>
                                                            </div>
                                                            {analysis.columns[selectedColumnIndex].is_high_cardinality && (
                                                                <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 text-xs rounded-full font-medium">High Cardinality</span>
                                                            )}
                                                        </div>

                                                        {analysis.columns[selectedColumnIndex].top_categories.length > 0 ? (
                                                            <div className="space-y-4">
                                                                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Top Occurrences</h4>
                                                                <div className="space-y-3">
                                                                    {analysis.columns[selectedColumnIndex].top_categories.map((cat, i) => {
                                                                        const totalNonNullable = analysis.columns[selectedColumnIndex].total_count - analysis.columns[selectedColumnIndex].null_count;
                                                                        const widthPct = totalNonNullable > 0 ? (cat.value / totalNonNullable) * 100 : 0;
                                                                        return (
                                                                            <div key={i} className="bg-black/20 border border-white/5 rounded-xl p-3 relative overflow-hidden group">
                                                                                <div 
                                                                                    className="absolute top-0 left-0 bottom-0 bg-blue-500/10 pointer-events-none transition-all duration-500" 
                                                                                    style={{ width: `${widthPct}%` }} 
                                                                                />
                                                                                <div className="relative z-10 flex justify-between items-center">
                                                                                    <span className="text-sm font-medium text-white max-w-[70%] truncate" title={cat.name}>{cat.name || '<empty>'}</span>
                                                                                    <div className="text-right flex flex-col items-end">
                                                                                        <span className="text-sm font-mono text-blue-400 font-bold">{cat.value.toLocaleString()}</span>
                                                                                        <span className="text-[10px] text-zinc-500 font-mono">{widthPct.toFixed(1)}%</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-center p-8 bg-black/20 rounded-xl border border-white/5">
                                                                <p className="text-zinc-500 text-sm">No categorical frequency data available.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}