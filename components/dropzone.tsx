"use client";

import { useCallback, useState } from "react";
import { UploadCloud, FileType } from "lucide-react";
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
        "relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg transition-all duration-200 cursor-pointer",
        isDragging ? "border-blue-500 bg-blue-500/10" : "border-neutral-700 bg-neutral-900/50 hover:bg-neutral-800",
        isProcessing && "opacity-50 pointer-events-none cursor-not-allowed"
      )}
    >
      <input
        type="file"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={handleChange}
        disabled={isProcessing}
      />
      
      <div className="flex flex-col items-center space-y-3 text-neutral-400">
        <div className="p-4 bg-neutral-800 rounded-full">
           {isDragging ? <FileType className="w-8 h-8 text-blue-400" /> : <UploadCloud className="w-8 h-8" />}
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-neutral-300">
            {isDragging ? "Drop to analyze" : "Click to upload or drag and drop"}
          </p>
          <p className="text-xs text-neutral-500 mt-1">CSV or Log files (Unlimited Size)</p>
        </div>
      </div>
    </div>
  );
}