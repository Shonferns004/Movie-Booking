import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sileo';
import 'sileo/styles.css';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-center"
        theme="dark"
        offset={{ top: 84, bottom: 24 }}
        options={{
          fill: '#2E353D',
          roundness: 18,
          duration: 4200,
          autopilot: { expand: 0, collapse: 60000 },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
