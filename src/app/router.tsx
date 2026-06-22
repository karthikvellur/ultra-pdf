import { createBrowserRouter } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Home } from '@/pages/Home';
import { NotFound } from '@/pages/NotFound';
import { EditPdf } from '@/pages/tools/EditPdf';
import { AddWatermark } from '@/pages/tools/AddWatermark';
import { AddPageNumbers } from '@/pages/tools/AddPageNumbers';
import { RemoveWatermark } from '@/pages/tools/RemoveWatermark';
import { RemovePassword } from '@/pages/tools/RemovePassword';
import { MergePdf } from '@/pages/tools/MergePdf';
import { SplitPdf } from '@/pages/tools/SplitPdf';
import { RotatePdf } from '@/pages/tools/RotatePdf';

export const router = createBrowserRouter([
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
      { path: 'tools/merge', element: <MergePdf /> },
      { path: 'tools/split', element: <SplitPdf /> },
      { path: 'tools/rotate', element: <RotatePdf /> },
      { path: '*', element: <NotFound /> },
    ],
  },
], {
  // Opt into v7 behavior now to keep the console clean and ease the upgrade.
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});
