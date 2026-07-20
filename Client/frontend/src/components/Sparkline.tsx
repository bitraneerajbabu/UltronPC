import React from 'react';

/**
 * Sparkline component to render a lightweight SVG graph.
 * @param {Object} props
 * @param {Array<number>} props.data - Array of numerical values to display
 * @param {number} [props.width=120] - Width of the SVG canvas
 * @param {number} [props.height=30] - Height of the SVG canvas
 * @param {string} [props.color='#0f766e'] - Color of the stroke line
 * @param {number} [props.strokeWidth=1.5] - Thickness of the stroke line
 */
export const Sparkline = ({ data = [], width = 120, height = 30, color = '#0f766e', strokeWidth = 1.5 }) => {
  const clean = data.filter(v => v != null);
  if (!data || data.length === 0 || clean.length === 0) {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ opacity: 0.3 }}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#cbd5e1" strokeWidth={strokeWidth} strokeDasharray="3,3" />
      </svg>
    );
  }

  const padding = 2;
  const innerHeight = height - padding * 2;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min === 0 ? 1 : max - min;

  const points = data
    .map((val, idx) => val != null ? [idx, val] : null)
    .filter(Boolean)
    .map(([idx, val]) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - padding - ((val - min) / range) * innerHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
