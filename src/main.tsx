import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Routes}  from './Routes.tsx';
import './index.css';

// No início do arquivo index.tsx ou App.tsx

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
)

root.render(
  <React.StrictMode>
    <RouterProvider router={Routes} />
  </React.StrictMode>,

);