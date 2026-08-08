import React from 'react';
import { T, BTN } from './theme';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: 'var(--bg)', padding: '24px',
      }}>
        <div style={{
          background: 'rgba(253,250,242,0.75)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(0,0,0,0.12)', borderRadius: '20px',
          padding: '48px 44px', maxWidth: '480px', textAlign: 'center',
          boxShadow: '0 20px 50px rgba(15,118,110,0.08)',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: T.text, marginBottom: '8px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '13px', color: T.textLabel, marginBottom: '24px', lineHeight: 1.5 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            style={BTN.primary}
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }
}
