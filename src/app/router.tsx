import { createBrowserRouter } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Home } from '@/pages/Home';
import { NotFound } from '@/pages/NotFound';
import { EditPdf } from '@/pages/tools/EditPdf';
import { AddWatermark } from '@/pages/tools/AddWatermark';
import { AddPageNumbers } from '@/pages/tools/AddPageNumbers';
import { RemoveWatermark } from '@/pages/tools/RemoveWatermark';
import { RemovePassword } from '@/pages/tools/RemovePassword';
import { ProtectPdf } from '@/pages/tools/ProtectPdf';
import { SignPdf } from '@/pages/tools/SignPdf';
import { MergePdf } from '@/pages/tools/MergePdf';
import { SplitPdf } from '@/pages/tools/SplitPdf';
import { RotatePdf } from '@/pages/tools/RotatePdf';
import { OrganizePages } from '@/pages/tools/OrganizePages';
import { ExtractPages } from '@/pages/tools/ExtractPages';
import { CompressPdf } from '@/pages/tools/CompressPdf';
import { PdfToImages } from '@/pages/tools/PdfToImages';
import { ImagesToPdf } from '@/pages/tools/ImagesToPdf';
import { ExtractText } from '@/pages/tools/ExtractText';

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        { index: true, element: <Home /> },
        { path: 'tools/edit', element: <EditPdf /> },
        { path: 'tools/watermark', element: <AddWatermark /> },
        { path: 'tools/page-numbers', element: <AddPageNumbers /> },
        { path: 'tools/remove-watermark', element: <RemoveWatermark /> },
        { path: 'tools/remove-password', element: <RemovePassword /> },
        { path: 'tools/protect', element: <ProtectPdf /> },
        { path: 'tools/sign', element: <SignPdf /> },
        { path: 'tools/merge', element: <MergePdf /> },
        { path: 'tools/split', element: <SplitPdf /> },
        { path: 'tools/rotate', element: <RotatePdf /> },
        { path: 'tools/organize-pages', element: <OrganizePages /> },
        { path: 'tools/extract-pages', element: <ExtractPages /> },
        { path: 'tools/compress', element: <CompressPdf /> },
        { path: 'tools/pdf-to-image', element: <PdfToImages /> },
        { path: 'tools/image-to-pdf', element: <ImagesToPdf /> },
        { path: 'tools/extract-text', element: <ExtractText /> },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  {
    // Opt into v7 behavior now to keep the console clean and ease the upgrade.
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);
