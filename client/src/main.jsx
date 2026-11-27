import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sileo';
import 'sileo/styles.css';
import App from './App.jsx';
import './styles.css';

function ResponsiveToaster() {
  const [position, setPosition] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
      ? 'top-center'
      : 'top-right',
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const sync = () => setPosition(query.matches ? 'top-center' : 'top-right');
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return (
    <Toaster
      position={position}
      theme="dark"
      offset={{ top: 84, bottom: 24 }}
      options={{
        fill: '#2E353D',
        roundness: 18,
        duration: 4200,
        autopilot: { expand: 0, collapse: 60000 },
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <ResponsiveToaster />
    </BrowserRouter>
  </React.StrictMode>
);
