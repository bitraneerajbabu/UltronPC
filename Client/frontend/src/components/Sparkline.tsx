import React from 'react';

interface SparklineProps {
  data?: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  isOffline?: boolean;
}

export const Sparkline = React.memo(({
  data = [],
  width = 120,
  height = 30,
  color = 'var(--primary-600)',
  strokeWidth = 1.5,
  isOffline = false,
}: SparklineProps) => {
  const clean = data.filter((v): v is number => v != null && !isNaN(v));

  if (!data || data.length === 0 || clean.length === 0) {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ opacity: 0.4 }}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={isOffline ? '#FFFFFF' : 'var(--border)'} strokeWidth={strokeWidth} strokeDasharray="4,4" />
      </svg>
    );
  }

  const padding = 2;
  const innerHeight = height - padding * 2;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min === 0 ? 1 : max - min;

  // Group data into continuous non-null segments (breaks line on null values)
  const segments: { x: number; y: number }[][] = [];
  let currentSegment: { x: number; y: number }[] = [];

  data.forEach((val, idx) => {
    const x = (idx / Math.max(1, data.length - 1)) * width;
    if (val != null && !isNaN(val)) {
      const y = height - padding - ((val - min) / range) * innerHeight;
      currentSegment.push({ x, y });
    } else {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
  });
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      {segments.map((seg, segIdx) => {
        if (seg.length === 1) {
          return (
            <circle
              key={segIdx}
              cx={seg[0].x}
              cy={seg[0].y}
              r={strokeWidth}
              fill={color}
              opacity={isOffline ? 0.6 : 1}
            />
          );
        }
        const pointsStr = seg.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        return (
          <polyline
            key={segIdx}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={isOffline ? "4,3" : undefined}
            opacity={isOffline ? 0.65 : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pointsStr}
          />
        );
      })}
    </svg>
  );
});
