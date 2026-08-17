import React from 'react'

export const PendingBadge = React.memo(() => (
  <span style={{
    display: 'inline-block',
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'var(--warning)20',
    color: 'var(--warning)',
    border: '1px solid var(--warning)40',
    marginLeft: '6px',
    verticalAlign: 'middle',
    animation: 'pulse 1.5s ease-in-out infinite',
  }}>saving...</span>
))

export const ErrorBadge = React.memo(({ message }: { message?: string }) => (
  <span title={message} style={{
    display: 'inline-block',
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'var(--danger)20',
    color: 'var(--danger)',
    border: '1px solid var(--danger)40',
    marginLeft: '6px',
    verticalAlign: 'middle',
  }}>failed</span>
))
