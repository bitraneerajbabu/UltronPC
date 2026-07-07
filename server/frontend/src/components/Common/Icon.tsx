import React from 'react';
import * as Lucide from 'lucide-react';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function Icon({ name, size = 20, color, className, style }: IconProps) {
  const LucideIcon = (Lucide as any)[name];
  if (!LucideIcon) {
    console.warn(`[Icon] Name "${name}" not found in lucide-react`);
    return null;
  }
  return <LucideIcon size={size} color={color} className={className} style={style} />;
}
