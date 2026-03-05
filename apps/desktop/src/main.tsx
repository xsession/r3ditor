import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100vw', height: '100vh', background: '#1e1e2e', color: '#f87171',
          fontFamily: 'monospace', padding: 32, flexDirection: 'column', gap: 12
        }}>
          <h1 style={{ fontSize: 20 }}>r3ditor — Startup Error</h1>
          <pre style={{ color: '#e0e0f0', fontSize: 12, maxWidth: '80vw', overflow: 'auto' }}>
            {this.state.error.message}
          </pre>
          <pre style={{ color: '#8888aa', fontSize: 11, maxWidth: '80vw', overflow: 'auto' }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
