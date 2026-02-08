"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Dropzone } from "@/components/dropzone";
import { Table, Play, FileJson, Calendar, Hash, Type, CheckSquare, AlertCircle } from "lucide-react";

type ColType = "Null" | "Boolean" | "Integer" | "Float" | "Date" | "String";
interface SchemaColumn { name: string; col_type: ColType; }
interface PreviewResult { schema: SchemaColumn[]; rows: (string | null)[][]; }

export default function Home() {
  const workerRef = useRef<Worker | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  const setupWorker = useCallback(() => {
    if (workerRef.current) workerRef.current.terminate();
    workerRef.current = new Worker(new URL("../workers/compute.worker.ts", import.meta.url));
    workerRef.current.onmessage = (event) => {
        const { status, result } = event.data;
        if (status === "preview_ready") {
            setPreview(result);
            setIsLoadingPreview(false);
        }
    };
    workerRef.current.postMessage({ action: "init_wasm" });
  }, []);

  useEffect(() => { setupWorker(); }, [setupWorker]);

  const handleFile = (f: File) => {
    setFile(f);
    setIsLoadingPreview(true);
    
    const chunk = f.slice(0, 2 * 1024 * 1024);
    const reader = new FileReader();
    reader.onload = (e) => {
        if (e.target?.result) {
            workerRef.current?.postMessage({ 
                action: "sniff_preview", 
                chunk: e.target.result 
            }, [e.target.result as ArrayBuffer]);
        }
    };
    reader.readAsArrayBuffer(chunk);
  };

  const TypeIcon = ({ type }: { type: ColType }) => {
    switch(type) {
        case "Integer": return <div className="flex items-center gap-1 text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold"><Hash className="w-3 h-3"/> INT</div>
        case "Float": return <div className="flex items-center gap-1 text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold"><Hash className="w-3 h-3"/> DEC</div>
        case "String": return <div className="flex items-center gap-1 text-neutral-400 bg-neutral-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold"><Type className="w-3 h-3"/> STR</div>
        case "Date": return <div className="flex items-center gap-1 text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold"><Calendar className="w-3 h-3"/> DATE</div>
        case "Boolean": return <div className="flex items-center gap-1 text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded text-[10px] font-bold"><CheckSquare className="w-3 h-3"/> BOOL</div>
        default: return <span className="text-neutral-600 text-[10px]">NULL</span>
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-200 font-sans p-8 flex flex-col items-center">
      <div className="w-full max-w-6xl space-y-6">
        
        <div className="border-b border-neutral-800 pb-6 flex justify-between items-end">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">LocalCrunch <span className="text-blue-500">Preview</span></h1>
                <p className="text-neutral-500 text-sm mt-1">Schema Detection Engine</p>
            </div>
        </div>

        {!file && (
            <Dropzone onFileSelect={handleFile} isProcessing={false} />
        )}

        {isLoadingPreview && (
            <div className="h-64 flex flex-col items-center justify-center text-neutral-500 animate-pulse">
                <FileJson className="w-12 h-12 mb-4 opacity-50" />
                <p>Sniffing schema & types...</p>
            </div>
        )}

        {preview && !isLoadingPreview && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                
                <div className="flex items-center justify-between bg-neutral-900/50 p-4 rounded-lg border border-neutral-800">
                    <div className="flex items-center gap-4">
                        <div className="bg-neutral-800 p-2 rounded">
                            <Table className="w-5 h-5 text-neutral-300" />
                        </div>
                        <div>
                            <h2 className="text-white font-medium">{file?.name}</h2>
                            <p className="text-xs text-neutral-500">{preview.schema.length} Columns detected</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <button 
                            onClick={() => { setFile(null); setPreview(null); }}
                            className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-md text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-900/20 transition-all">
                            <Play className="w-4 h-4" /> Analyze Full File
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-12 gap-6">
                    
                    <div className="col-span-3 space-y-2">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Detected Schema</h3>
                        <div className="space-y-1 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {preview.schema.map((col, i) => (
                                <div key={i} className="flex items-center justify-between p-2 rounded bg-neutral-900 border border-neutral-800/50">
                                    <span className="text-sm text-neutral-300 truncate w-24" title={col.name}>{col.name}</span>
                                    <TypeIcon type={col.col_type} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="col-span-9">
                         <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Row Preview (First 50)</h3>
                         <div className="border border-neutral-800 rounded-lg overflow-hidden bg-[#0c0c0c] shadow-xl">
                            <div className="overflow-x-auto max-h-[500px]">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-[#111] sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            {preview.schema.map((col, i) => (
                                                <th key={i} className="px-4 py-3 border-b border-neutral-800 font-medium text-neutral-400 text-xs">
                                                    {col.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800/50">
                                        {preview.rows.map((row, r_idx) => (
                                            <tr key={r_idx} className="hover:bg-neutral-900/50 transition-colors group">
                                                {row.map((cell, c_idx) => (
                                                    <td key={c_idx} className="px-4 py-2 text-neutral-300 font-mono text-xs border-r border-transparent group-hover:border-neutral-800 last:border-0">
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

                </div>
            </div>
        )}
      </div>
    </div>
  );
}