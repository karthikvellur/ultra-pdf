import { useCallback, useId, useRef, useState } from 'react';
import { isPdfFile } from '@/lib/pdf/load';
import './Dropzone.css';

interface DropzoneProps {
  /** Allow selecting more than one file. */
  multiple?: boolean;
  /** Restrict to PDFs (default true). */
  pdfOnly?: boolean;
  label?: string;
  hint?: string;
  onFiles: (files: File[]) => void;
}

export function Dropzone({
  multiple = false,
  pdfOnly = true,
  label = 'Drop your PDF here',
  hint = 'or click to browse',
  onFiles,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      const accepted = pdfOnly ? files.filter(isPdfFile) : files;
      if (accepted.length === 0) {
        setError('Please choose a PDF file.');
        return;
      }
      setError(null);
      onFiles(multiple ? accepted : accepted.slice(0, 1));
    },
    [multiple, pdfOnly, onFiles],
  );

  return (
    <div>
      <label
        htmlFor={inputId}
        className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <svg
          className="dropzone__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5-5 5 5" />
          <path d="M12 5v12" />
        </svg>
        <div className="dropzone__label">{label}</div>
        <div className="dropzone__hint">{hint}</div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={pdfOnly ? 'application/pdf,.pdf' : undefined}
          multiple={multiple}
          className="visually-hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>
      {error && <p className="dropzone__error">{error}</p>}
    </div>
  );
}
