import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { getTool } from '@/tools/registry';
import { useBackend } from '@/hooks/useBackend';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { extractTextClient } from '@/lib/pdf/text';
import { serverExtractText } from '@/lib/api/operations';
import { downloadBytes } from '@/lib/pdf/download';
import './tools.css';

const TOOL = getTool('extract-text')!;

export function ExtractText() {
  const { status } = useBackend();
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [text, setText] = useState('');
  const [method, setMethod] = useState<'embedded' | 'ocr' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedHint, setScannedHint] = useState(false);

  const serverUp = status === 'online';

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setText('');
    setMethod(null);
    setError(null);
    setScannedHint(false);
  }

  async function run(forceOcr: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (forceOcr || !text) {
        // Try the client first (fast, private) unless OCR is explicitly forced.
        if (!forceOcr) {
          const client = await extractTextClient(file.bytes);
          setText(client.text);
          setMethod('embedded');
          setScannedHint(client.looksScanned);
          // If it looks scanned and the server is up, auto-escalate to OCR.
          if (client.looksScanned && serverUp) {
            const ocr = await serverExtractText(
              file.bytes,
              `${file.name}.pdf`,
              true,
            );
            setText(ocr.text);
            setMethod('ocr');
            setScannedHint(false);
          }
          return;
        }
        const res = await serverExtractText(file.bytes, `${file.name}.pdf`, true);
        setText(res.text);
        setMethod(res.method);
        setScannedHint(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Text extraction failed.');
    } finally {
      setBusy(false);
    }
  }

  function downloadTxt() {
    if (!file) return;
    const bytes = new TextEncoder().encode(text);
    downloadBytes(bytes, `${file.name}.txt`, 'text/plain');
  }

  return (
    <ToolShell tool={TOOL}>
      {!file ? (
        <Dropzone label="Drop a PDF to extract text" onFiles={handleFiles} />
      ) : (
        <div className="card panel">
          <div className="file-chip">
            <div className="file-chip__meta">
              <span className="file-chip__name">{file.name}.pdf</span>
              {method && (
                <span className="muted">
                  via {method === 'ocr' ? 'OCR (server)' : 'text layer'}
                </span>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>
              Change file
            </button>
          </div>

          {method === null && (
            <div className="toolbar">
              <button
                className="btn btn-primary"
                onClick={() => run(false)}
                disabled={busy}
              >
                {busy ? 'Extracting…' : 'Extract text'}
              </button>
            </div>
          )}

          {scannedHint && method === 'embedded' && (
            <p className="notice notice--warning">
              This looks like a scanned document with little selectable text.{' '}
              {serverUp ? (
                <button className="btn btn-ghost btn-sm" onClick={() => run(true)}>
                  Run OCR on the server
                </button>
              ) : (
                <>Start the backend to OCR it into text.</>
              )}
            </p>
          )}

          {error && <p className="notice notice--error">{error}</p>}

          {method !== null && (
            <>
              <textarea
                className="text-output"
                value={text}
                readOnly
                placeholder="(no text found)"
              />
              <div className="toolbar">
                <button
                  className="btn btn-primary"
                  onClick={downloadTxt}
                  disabled={!text}
                >
                  Download .txt
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => navigator.clipboard?.writeText(text)}
                  disabled={!text}
                >
                  Copy
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </ToolShell>
  );
}
