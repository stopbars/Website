import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.env.DEV) {
  void enableDevDiagnostics();
}

async function enableDevDiagnostics() {
  if (import.meta.env.VITE_ENABLE_REACT_GRAB === 'true') {
    await import('react-grab');
  }

  if (import.meta.env.VITE_ENABLE_REACT_SCAN === 'true') {
    const { scan } = await import('react-scan');

    scan({
      enabled: true,
      log: true,
    });
  }
}
