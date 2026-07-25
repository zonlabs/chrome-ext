import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

/** Mount the React app into the side panel DOM. */
createRoot(document.getElementById('root')!).render(
  <Suspense fallback={null}>
    <App />
  </Suspense>
);
