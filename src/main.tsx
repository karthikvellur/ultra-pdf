import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { BackendProvider } from '@/hooks/useBackend';
import '@/styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BackendProvider>
      <RouterProvider router={router} />
    </BackendProvider>
  </React.StrictMode>,
);
