import { useRef, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { PageCanvas } from '@/components/PageCanvas';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { applySignature } from '@/lib/pdf/edit';
import { downloadBytes, ensurePdfName } from '@/lib/pdf/download';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';
import { SignaturePad } from './SignaturePad';
import './tools.css';

const TOOL = getTool('sign')!;
const PAGE_WIDTH = 520;
// Placed signature size as a fraction of page width; height scales with image.
const SIG_W = 0.28;

export function SignPdf() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [sigPng, setSigPng] = useState<Uint8Array | null>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [sigAspect, setSigAspect] = useState(0.35); // h/w
  const [placement, setPlacement] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const { doc } = usePdfRenderer(file?.bytes ?? null);

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setPageIndex(0);
    setPlacement(null);
  }

  function handleSignature(png: Uint8Array, aspect: number) {
    if (sigUrl) URL.revokeObjectURL(sigUrl);
    const copy = new Uint8Array(png.byteLength);
    copy.set(png);
    const blob = new Blob([copy.buffer], { type: 'image/png' });
    setSigPng(png);
    setSigUrl(URL.createObjectURL(blob));
    setSigAspect(aspect);
  }

  function handlePlace(e: React.MouseEvent) {
    if (!sigPng) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    setPlacement({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }

  async function handleSave() {
    if (!file || !sigPng || !placement) return;
    setBusy(true);
    try {
      const height = SIG_W * sigAspect; // normalized height relative to page width≈height proportion
      const out = await applySignature(file.bytes, {
        pngBytes: sigPng,
        pageIndex,
        x: placement.x,
        y: placement.y,
        width: SIG_W,
        height,
      });
      downloadBytes(out, ensurePdfName(`${file.name}-signed`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell tool={TOOL}>
      {!file ? (
        <Dropzone label="Drop a PDF to sign" onFiles={handleFiles} />
      ) : (
        <div className="editor">
          <div className="card editor__tools">
            <SignaturePad onChange={handleSignature} />

            {sigUrl && (
              <p className="muted" style={{ fontSize: 12 }}>
                Now click on the page where you want to place it.
              </p>
            )}

            <hr style={{ width: '100%', border: 0, borderTop: '1px solid var(--color-border)' }} />

            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={busy || !sigPng || !placement}
            >
              {busy ? 'Saving…' : 'Place & download'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>
              Change file
            </button>
          </div>

          <div className="editor__stage">
            {doc && (
              <div className="page-nav">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setPageIndex((i) => Math.max(0, i - 1));
                    setPlacement(null);
                  }}
                  disabled={pageIndex === 0}
                >
                  ‹ Prev
                </button>
                <span className="muted">
                  Page {pageIndex + 1} of {doc.numPages}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setPageIndex((i) => Math.min(doc.numPages - 1, i + 1));
                    setPlacement(null);
                  }}
                  disabled={pageIndex >= doc.numPages - 1}
                >
                  Next ›
                </button>
              </div>
            )}

            {doc && (
              <div className="editor__page" style={{ width: PAGE_WIDTH }}>
                <PageCanvas
                  key={pageIndex}
                  doc={doc}
                  pageNumber={pageIndex + 1}
                  width={PAGE_WIDTH}
                />
                <div
                  ref={overlayRef}
                  className="editor__overlay"
                  style={{ cursor: sigPng ? 'copy' : 'not-allowed' }}
                  onClick={handlePlace}
                >
                  {placement && sigUrl && (
                    <img
                      src={sigUrl}
                      alt="signature"
                      style={{
                        position: 'absolute',
                        left: `${placement.x * 100}%`,
                        top: `${placement.y * 100}%`,
                        width: `${SIG_W * 100}%`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ToolShell>
  );
}
