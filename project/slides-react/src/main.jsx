import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { Appearance } from './components/common/Appearance.jsx';
import { DemoNotice } from './components/common/DemoNotice.jsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx';
import './styles/original.css';
import './styles/studio.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div className="studio-tools">
      <DemoNotice />
      <Appearance />
    </div>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <footer className="studio-footer">AI 创作台 · React 还原项目</footer>
  </React.StrictMode>,
);
