"use client";

import { useCallback, useState } from "react";
import { UploadCloud } from "lucide-react";
import { clsx } from "clsx";

interface DropzoneProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

export function Dropzone({ onFileSelect, isProcessing }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={clsx(
        "relative flex h-60 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors",
        isDragging
          ? "border-accent bg-accent-soft"
          : "border-line-strong bg-surface hover:border-accent/60 hover:bg-accent-soft/40",
        isProcessing && "pointer-events-none opacity-50"
      )}
    >
      <input
        type="file"
        accept=".csv,text/csv,.txt"
        aria-label="Choose a CSV file"
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        onChange={handleChange}
        disabled={isProcessing}
      />

      <div className="pointer-events-none flex flex-col items-center gap-3 px-6">
        <div className={clsx("rounded-full p-3", isDragging ? "bg-accent text-white" : "bg-sunken text-muted")}>
          <UploadCloud className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-ink">
            {isDragging ? "Release to analyze" : "Drop a CSV file here"}
          </p>
          <p className="text-sm text-muted">or click to browse</p>
        </div>
      </div>
    </div>
  );
}
