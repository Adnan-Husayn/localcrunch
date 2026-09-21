"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Download, FlaskConical, Play, RefreshCw, ShieldCheck, X, XCircle } from "lucide-react";
import { Dropzone } from "@/components/dropzone";
import { Logo } from "@/components/logo";
import { SeverityTag } from "@/components/severity-tag";
import { TypeBadge } from "@/components/type-badge";
import { FilterPanel } from "@/components/filter-panel";
import { ColumnDetail } from "@/components/column-detail";
import { downloadText } from "@/lib/download";
import { buildFindings } from "@/lib/insights";
import { buildReport, describeFilter } from "@/lib/report";
import { createSampleFile, SAMPLE_FILE_NAME } from "@/lib/sample-data";
import type { AnalysisResult, Filter, PreviewResult, SchemaColumn } from "@/lib/types";

const CHUNK_SIZE = 10 * 1024 * 1024;
const FINDINGS_PREVIEW = 4;

const formatBytes = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function AnalyzePage() {
    const workerRef = useRef<Worker | null>(null);
    // The worker's message handler outlives renders, so it reads the current file from a ref.
    const fileRef = useRef<File | null>(null);

    const [file, setFile] = useState<File | null>(null);
    const [columns, setColumns] = useState<SchemaColumn[]>([]);
    const [preview, setPreview] = useState<PreviewResult | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const [progress, setProgress] = useState(0);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [throughput, setThroughput] = useState(0);
    const [activeFilters, setActiveFilters] = useState<Filter[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [selectedColumnIndex, setSelectedColumnIndex] = useState(0);
    const [showAllFindings, setShowAllFindings] = useState(false);

    const offsetRef = useRef(0);
    const startTimeRef = useRef(0);
    const lastTickRef = useRef<number>(0);
    const lastBytesRef = useRef<number>(0);

    const isSample = file?.name === SAMPLE_FILE_NAME;

    const readNextChunk = useCallback(() => {
        const f = fileRef.current;
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
    }, []);

    const setupWorker = useCallback(() => {
        if (workerRef.current) workerRef.current.terminate();

        const worker = new Worker(new URL("../../workers/compute.worker.ts", import.meta.url));
        workerRef.current = worker;

        worker.onmessage = (event) => {
            const { status, result, stats } = event.data;

            if (status === "preview_ready") {
                setIsLoadingPreview(false);
                if (result.schema.length === 0) {
                    fileRef.current = null;
                    setFile(null);
                    setErrorMessage("No columns found. Is this a CSV file with a header row?");
                } else {
                    setPreview(result);
                    setColumns(result.schema);
                }
            }

            else if (status === "progress") {
                if (stats) setAnalysis(stats);

                const f = fileRef.current;
                if (f) {
                    const currentBytes = offsetRef.current;
                    setProgress(Math.min(99, (currentBytes / f.size) * 100));

                    const now = Date.now();
                    if (now - lastTickRef.current > 500) {
                        const deltaBytes = currentBytes - lastBytesRef.current;
                        const deltaSec = (now - lastTickRef.current) / 1000;
                        setThroughput(deltaBytes / 1024 / 1024 / deltaSec);
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
                const f = fileRef.current;
                if (f) {
                    const seconds = Math.max((Date.now() - startTimeRef.current) / 1000, 0.001);
                    setThroughput(f.size / 1024 / 1024 / seconds);
                }
            }

            else if (status === "error") {
                setIsProcessing(false);
                setIsLoadingPreview(false);
                setErrorMessage(event.data.error ?? "Something went wrong");
            }
        };

        worker.postMessage({ action: "init_wasm" });
    }, [readNextChunk]);

    // One worker for the page's lifetime (replaced only by "Start over").
    useEffect(() => {
        setupWorker();
        return () => workerRef.current?.terminate();
    }, [setupWorker]);

    const handleFileDrop = useCallback((selectedFile: File) => {
        fileRef.current = selectedFile;
        setFile(selectedFile);
        setErrorMessage(null);
        setIsLoadingPreview(true);
        setAnalysis(null);
        setIsProcessing(false);
        setProgress(0);
        setSelectedColumnIndex(0);
        setShowAllFindings(false);

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
    }, []);

    // The landing page links here with ?sample=1 to open the sample dataset directly.
    const autoLoadedRef = useRef(false);
    useEffect(() => {
        if (autoLoadedRef.current) return;
        autoLoadedRef.current = true;
        if (new URLSearchParams(window.location.search).get("sample") === "1") {
            // Deferred so the worker created by the effect above exists first.
            setTimeout(() => handleFileDrop(createSampleFile()), 0);
        }
    }, [handleFileDrop]);

    const runAnalysis = useCallback((filters: Filter[]) => {
        if (!columns.length || !fileRef.current) return;

        setPreview(null);
        setIsProcessing(true);
        setProgress(0);
        setErrorMessage(null);
        offsetRef.current = 0;
        lastBytesRef.current = 0;
        startTimeRef.current = Date.now();
        lastTickRef.current = Date.now();

        workerRef.current?.postMessage({
            action: "start_stream",
            columnCount: columns.length,
            filters
        });

        readNextChunk();
    }, [columns, readNextChunk]);

    const handleStartAnalysis = () => runAnalysis(activeFilters);

    // Explorer: narrow the dataset to one value, or drop a filter, and re-run.
    const filterToValue = (colIndex: number, value: string) => {
        const next: Filter[] = [
            ...activeFilters.filter((f) => !(f.col_index === colIndex && f.operator === "==")),
            { col_index: colIndex, operator: "==", value },
        ];
        setActiveFilters(next);
        runAnalysis(next);
    };

    const removeFilter = (idx: number) => {
        const next = activeFilters.filter((_, i) => i !== idx);
        setActiveFilters(next);
        runAnalysis(next);
    };

    const findings = useMemo(
        () => (analysis && !isProcessing ? buildFindings(columns, analysis, activeFilters) : []),
        [analysis, columns, isProcessing, activeFilters]
    );
    const warningColumns = useMemo(
        () => new Set(findings.filter((f) => f.severity === "warning" && f.columnIndex !== null).map((f) => f.columnIndex)),
        [findings]
    );
    const isEmptyResult = !!analysis && !isProcessing && analysis.rows_processed === 0;
    const warningCount = findings.filter((f) => f.severity === "warning").length;
    const visibleFindings = showAllFindings ? findings : findings.slice(0, FINDINGS_PREVIEW);

    const exportReport = () => {
        if (!analysis || !file) return;
        const baseName = file.name.replace(/\.[^.]+$/, "");
        downloadText(`${baseName}-profile.md`, buildReport(file.name, columns, analysis, findings, activeFilters), "text/markdown");
    };

    const handleReset = () => {
        fileRef.current = null;
        setFile(null);
        setPreview(null);
        setAnalysis(null);
        setColumns([]);
        setActiveFilters([]);
        setIsProcessing(false);
        setProgress(0);
        setThroughput(0);
        setSelectedColumnIndex(0);
        setShowAllFindings(false);
        setErrorMessage(null);
        setupWorker();
    };

    const showDashboard = isProcessing || analysis;
    const selectedStats = analysis?.columns[selectedColumnIndex];
    const selectedColumn = columns[selectedColumnIndex];

    return (
        <div className="min-h-screen bg-canvas text-ink">
            <header className="border-b border-line bg-surface">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
                    <Logo tagline />

                    {(preview || showDashboard) && (
                        <button
                            onClick={handleReset}
                            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-sunken"
                        >
                            <RefreshCw className="h-3.5 w-3.5" /> Start over
                        </button>
                    )}
                </div>
            </header>

            <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
                {errorMessage && (
                    <div role="alert" className="mx-auto flex max-w-2xl items-center gap-2 rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-bad">
                        <XCircle className="h-4 w-4 shrink-0" /> {errorMessage}
                    </div>
                )}

                {/* No file yet */}
                {!file && (
                    <div className="fade-in mx-auto max-w-2xl space-y-8 pt-6 sm:pt-12">
                        <div className="space-y-3 text-center">
                            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Profile any CSV, privately</h1>
                            <p className="mx-auto max-w-lg text-base text-muted">
                                See column types, distributions, missing values, duplicates and data-quality problems in seconds, then click through the data to explore it.
                            </p>
                        </div>

                        <Dropzone onFileSelect={handleFileDrop} isProcessing={false} />

                        <div className="flex flex-col items-center gap-3">
                            <button
                                onClick={() => handleFileDrop(createSampleFile())}
                                className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:bg-accent-soft"
                            >
                                <FlaskConical className="h-4 w-4 text-accent" />
                                No file? Try it with sample data
                            </button>
                            <p className="flex items-center gap-1.5 text-xs text-muted">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Runs entirely in your browser. Your file is never uploaded.
                            </p>
                        </div>
                    </div>
                )}

                {isLoadingPreview && (
                    <div className="fade-in flex h-48 flex-col items-center justify-center gap-3 text-muted">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
                        <p className="text-sm">Reading the first rows…</p>
                    </div>
                )}

                {/* Preview + filters, before running */}
                {preview && !isLoadingPreview && (
                    <div className="fade-in space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base font-semibold">{file?.name}</h2>
                                    {isSample && (
                                        <span className="rounded-sm bg-mark px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-ink">
                                            SAMPLE DATA
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-muted">
                                    {file && formatBytes(file.size)} · {preview.schema.length} columns · showing the first {preview.rows.length} rows
                                </p>
                            </div>
                            <button
                                onClick={handleStartAnalysis}
                                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
                            >
                                <Play className="h-4 w-4" /> Run analysis
                            </button>
                        </div>

                        <FilterPanel columns={columns} filters={activeFilters} onChange={setActiveFilters} />

                        <div className="overflow-hidden rounded-xl border border-line bg-surface">
                            <div className="max-h-[480px] overflow-auto">
                                <table className="w-full whitespace-nowrap text-left text-sm">
                                    <thead className="sticky top-0 z-10 bg-sunken">
                                        <tr>
                                            {preview.schema.map((col, i) => (
                                                <th key={i} className="border-b border-line px-4 py-3 font-medium text-ink">
                                                    <div className="flex items-center gap-2">
                                                        {col.name}
                                                        <TypeBadge type={col.col_type} />
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-line">
                                        {preview.rows.map((row, r) => (
                                            <tr key={r} className="hover:bg-canvas">
                                                {row.map((cell, c) => (
                                                    <td key={c} className="px-4 py-2 font-mono text-xs text-muted">
                                                        {cell === null ? <span className="italic text-faint">empty</span> : cell}
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

                {/* Analysis */}
                {showDashboard && (
                    <div className="fade-in space-y-4 pb-16">
                        <div className="rounded-xl border border-line bg-surface p-5">
                            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                                <div>
                                    <div className="text-sm font-medium text-muted">
                                        {isProcessing ? "Analyzing…" : "Analysis complete"}
                                        {isSample && <span className="text-faint"> · sample data</span>}
                                    </div>
                                    <div className="mt-1 font-mono text-3xl font-semibold tracking-tight">
                                        {(analysis?.rows_processed ?? 0).toLocaleString()}
                                        <span className="ml-2 font-sans text-base font-normal text-muted">rows</span>
                                    </div>
                                </div>
                                <div className="sm:text-right">
                                    <div className="text-sm font-medium text-muted">{isProcessing ? "Speed" : "Average speed"}</div>
                                    <div className="mt-1 font-mono text-xl font-semibold">
                                        {throughput > 0 && throughput < 0.1 ? "<0.1" : throughput.toFixed(1)}
                                        <span className="ml-1 font-sans text-sm font-normal text-muted">MB/s</span>
                                    </div>
                                </div>
                            </div>
                            <div
                                role="progressbar"
                                aria-valuenow={Math.round(progress)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                className="mt-4 h-2 w-full overflow-hidden rounded-sm bg-sunken"
                            >
                                <div style={{ width: `${progress}%` }} className="h-full bg-accent transition-[width] duration-150" />
                            </div>
                            {activeFilters.length > 0 && (
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-medium text-muted">Filtered to</span>
                                    {activeFilters.map((f, idx) => (
                                        <span key={idx} className="inline-flex items-center gap-1 rounded-md border border-mark bg-accent-soft py-1 pl-2 pr-1 text-xs font-medium text-ink">
                                            {describeFilter(f, columns)}
                                            <button
                                                aria-label={`Remove filter ${describeFilter(f, columns)}`}
                                                onClick={() => removeFilter(idx)}
                                                disabled={isProcessing}
                                                className="rounded p-0.5 hover:bg-accent/10 disabled:opacity-40"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {isEmptyResult && (
                            <section className="rounded-xl border border-dashed border-line-strong bg-surface p-8 text-center">
                                <p className="text-base font-semibold">No rows to show</p>
                                <p className="mt-1 text-sm text-muted">
                                    {activeFilters.length > 0
                                        ? "No rows match the current filters. Remove a filter above to see data again."
                                        : "This file has a header but no data rows."}
                                </p>
                            </section>
                        )}

                        {analysis && !isProcessing && !isEmptyResult && (
                            <section className="rounded-xl border border-line bg-surface p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-base font-semibold">
                                            {findings.length === 0
                                                ? "No data quality issues found"
                                                : `${findings.length} ${findings.length === 1 ? "finding" : "findings"}`}
                                            {warningCount > 0 && <span className="font-normal text-muted"> · {warningCount} to look at</span>}
                                        </h2>
                                    </div>
                                    <button
                                        onClick={exportReport}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-sunken"
                                    >
                                        <Download className="h-3.5 w-3.5" /> Export report
                                    </button>
                                </div>

                                {findings.length > 0 && (
                                    <ul className="mt-4 divide-y divide-line">
                                        {visibleFindings.map((f, i) => {
                                            const target = f.columnIndex;
                                            const row = (
                                                <>
                                                    <SeverityTag severity={f.severity} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="text-sm font-medium text-ink">
                                                            {target !== null && <span className="font-mono">{columns[target]?.name}</span>}
                                                            {target !== null ? " / " : ""}{f.title}
                                                        </span>
                                                        <span className="block text-sm text-muted">{f.detail}</span>
                                                    </span>
                                                </>
                                            );
                                            return (
                                                <li key={i}>
                                                    {target === null ? (
                                                        <div className="flex gap-3 py-3">{row}</div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setSelectedColumnIndex(target)}
                                                            className="flex w-full gap-3 rounded-md py-3 text-left transition-colors hover:bg-canvas"
                                                        >
                                                            {row}
                                                        </button>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}

                                {findings.length > FINDINGS_PREVIEW && (
                                    <button
                                        onClick={() => setShowAllFindings((v) => !v)}
                                        className="mt-2 text-sm font-medium text-ink underline underline-offset-4 hover:text-accent-strong"
                                    >
                                        {showAllFindings ? "Show fewer" : `Show all ${findings.length} findings`}
                                    </button>
                                )}
                            </section>
                        )}

                        {analysis && columns.length > 0 && !isEmptyResult && (
                            <div className="flex flex-col gap-4 lg:flex-row">
                                <nav
                                    aria-label="Columns"
                                    className="flex max-h-[560px] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface lg:w-72"
                                >
                                    <div className="border-b border-line px-4 py-3 text-sm font-semibold">
                                        Columns <span className="font-normal text-muted">({columns.length})</span>
                                    </div>
                                    <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
                                        {columns.map((col, idx) => (
                                            <li key={idx}>
                                                <button
                                                    onClick={() => setSelectedColumnIndex(idx)}
                                                    aria-current={selectedColumnIndex === idx}
                                                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                                        selectedColumnIndex === idx
                                                            ? "bg-accent-soft font-medium text-accent-strong"
                                                            : "text-ink hover:bg-sunken"
                                                    }`}
                                                >
                                                    <span className="flex min-w-0 items-center gap-2">
                                                        <span className="truncate">{col.name}</span>
                                                        {warningColumns.has(idx) && (
                                                            <span title="Has findings" className="h-1.5 w-1.5 shrink-0 bg-ink" />
                                                        )}
                                                    </span>
                                                    <TypeBadge type={col.col_type} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </nav>

                                <section className="min-h-[420px] min-w-0 flex-1 rounded-xl border border-line bg-canvas/40 p-5 sm:p-6">
                                    {selectedStats && selectedColumn && (
                                        <ColumnDetail
                                            key={selectedColumnIndex}
                                            column={selectedColumn}
                                            stats={selectedStats}
                                            findings={findings.filter((f) => f.columnIndex === selectedColumnIndex)}
                                            canFilter={!isProcessing}
                                            onFilterValue={(value) => filterToValue(selectedColumnIndex, value)}
                                        />
                                    )}
                                </section>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
