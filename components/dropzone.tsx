"use client";

import { useCallback, useState } from "react";
import { UploadCloud, FileType } from "lucide-react";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "framer-motion";

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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={clsx(
        "relative flex flex-col items-center justify-center w-full h-72 rounded-2xl transition-all duration-300 cursor-pointer overflow-hidden",
        "bg-neutral-900/40 backdrop-blur-xl border border-neutral-800/50 hover:bg-neutral-800/60 shadow-2xl",
        isProcessing && "opacity-50 pointer-events-none cursor-not-allowed"
      )}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 pointer-events-none rounded-2xl box-border border-2 border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.6)] bg-blue-500/5"
          />
        )}
      </AnimatePresence>

      <input
        type="file"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        onChange={handleChange}
        disabled={isProcessing}
      />
      
      <div className="flex flex-col items-center space-y-6 z-0">
        <motion.div 
          animate={
            isDragging 
              ? { scale: 1.2, y: -10, rotate: [-5, 5, -5] } 
              : { scale: 1, y: [0, -10, 0] }
          }
          transition={
            isDragging 
              ? { rotate: { repeat: Infinity, duration: 0.5 } }
              : { repeat: Infinity, duration: 3, ease: "easeInOut" }
          }
          className={clsx(
            "p-6 rounded-full transition-all duration-300 relative",
            isDragging ? "bg-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.4)]" : "bg-neutral-800/80 shadow-lg"
          )}
        >
           {isDragging ? <FileType className="w-12 h-12 text-blue-400" /> : <UploadCloud className="w-12 h-12 text-neutral-300" />}
           
           {/* Pulsing ring behind the icon when idle */}
           {!isDragging && (
             <motion.div 
               animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
               transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
               className="absolute inset-0 rounded-full border border-neutral-600 pointer-events-none"
             />
           )}
        </motion.div>
        
        <div className="text-center space-y-2 relative">
          <motion.p 
            animate={isDragging ? { scale: 1.05, color: "#60a5fa" } : { scale: 1, color: "#e4e4e7" }}
            className="text-xl font-bold tracking-tight"
          >
            {isDragging ? "Drop Data File to Ignite Engine" : "Upload Data or Drag & Drop"}
          </motion.p>
          <p className="text-sm text-neutral-500 font-mono tracking-widest uppercase">
            {isDragging ? "Release..." : "Parses CSV or JSON logs (Infinite Size)"}
          </p>
        </div>
      </div>
    </motion.div>
  );
}