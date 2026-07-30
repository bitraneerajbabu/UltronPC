import React from 'react'

export const PendingBadge = React.memo(() => (
  <span style={{
    display: 'inline-block',
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '3px',
    background: '#f59e0b20',
    color: '#d97706',
    border: '1px solid #f59e0b40',
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
    background: '#ef444420',
    color: '#dc2626',
    border: '1px solid #ef444440',
    marginLeft: '6px',
    verticalAlign: 'middle',
  }}>failed</span>
))
