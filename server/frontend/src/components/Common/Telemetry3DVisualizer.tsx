import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper, useTheme } from '@mui/material';
import Icon from './Icon';

interface Site {
  id: number;
  name: string;
  location: string;
  is_active: boolean;
  last_sync?: string;
  client_version?: string;
}

interface Telemetry3DVisualizerProps {
  sites: any[];
  activeSite: any;
  onSelectSite: (site: any) => void;
}

interface Node3D {
  site: Site;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  size: number;
  color: string;
  status: 'live' | 'recent' | 'offline' | 'never';
}

function parseISTDate(ts?: string | null): Date | null {
  if (!ts) return null;
  const cleanTs = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const d = new Date(cleanTs);
  if (isNaN(d.getTime())) return null;
  return d;
}

function getSiteStatus(site: Site): { label: string; color: string; type: 'live' | 'recent' | 'offline' | 'never' } {
  if (!site.is_active) return { label: 'Deactivated', color: '#EF4444', type: 'offline' };
  if (!site.last_sync) return { label: 'Never Connected', color: '#9CA3AF', type: 'never' };
  
  const d = parseISTDate(site.last_sync);
  if (!d) return { label: 'Never Connected', color: '#9CA3AF', type: 'never' };
  
  const diffMs = Math.abs(Date.now() - d.getTime());
  const diffMins = diffMs / 60000;
  
  if (diffMins < 5) return { label: 'Live', color: '#16A34A', type: 'live' };
  if (diffMins < 60) return { label: 'Recent', color: '#F59E0B', type: 'recent' };
  return { label: 'Offline', color: '#DC2626', type: 'offline' };
}

export default function Telemetry3DVisualizer({ sites, activeSite, onSelectSite }: Telemetry3DVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  
  const [hoveredNode, setHoveredNode] = useState<Node3D | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [angles, setAngles] = useState({ x: -0.3, y: 0.5 });
  
  const dragStart = useRef({ x: 0, y: 0 });
  const angleStart = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef<number | null>(null);
  const rotationVelocity = useRef({ x: 0, y: 0.003 });
  
  // Track interactions
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    angleStart.current = { ...angles };
    rotationVelocity.current = { x: 0, y: 0 };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left + 15, y: e.clientY - rect.top + 15 });

    if (isDragging) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      
      const newAngles = {
        x: angleStart.current.x + dy * 0.01,
        y: angleStart.current.y + dx * 0.01
      };
      
      // Limit pitch to prevent flipping upside down
      newAngles.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, newAngles.x));
      setAngles(newAngles);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setIsDragging(false);
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      // Add a slight momentum rotation
      rotationVelocity.current = {
        x: dy * 0.0002,
        y: dx * 0.0002
      };
    }
  };

  const handleCanvasClick = () => {
    if (hoveredNode) {
      onSelectSite(hoveredNode.site);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = 400;
    let height = canvas.height = 360;

    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        width = canvas.width = containerRef.current.clientWidth;
        height = canvas.height = 360;
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);

    // Seed spherical positions for sites
    const R = 100; // Sphere radius
    const nodes: Node3D[] = sites.map((site) => {
      // Deterministic latitude/longitude coordinates based on site ID
      const lat = (Math.sin(site.id * 1.7) * 0.5 + 0.5) * Math.PI - Math.PI / 2;
      const lon = (Math.cos(site.id * 2.3) * 0.5 + 0.5) * 2 * Math.PI - Math.PI;
      
      const statusInfo = getSiteStatus(site);
      
      return {
        site,
        x: R * Math.cos(lat) * Math.sin(lon),
        y: R * Math.sin(lat),
        z: R * Math.cos(lat) * Math.cos(lon),
        sx: 0,
        sy: 0,
        size: 6,
        color: statusInfo.color,
        status: statusInfo.type
      };
    });

    let currentAngles = { ...angles };
    let flowParticles: { nodeIndex: number; progress: number; speed: number; color: string }[] = [];
    
    // Seed telemetry flow particles
    nodes.forEach((node, idx) => {
      if (node.status === 'live') {
        flowParticles.push({
          nodeIndex: idx,
          progress: Math.random(),
          speed: 0.005 + Math.random() * 0.008,
          color: node.color
        });
        flowParticles.push({
          nodeIndex: idx,
          progress: Math.random(),
          speed: 0.005 + Math.random() * 0.008,
          color: node.color
        });
      }
    });

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Rotate angles
      if (!isDragging) {
        currentAngles.y += rotationVelocity.current.y;
        currentAngles.x += rotationVelocity.current.x;
        // Slow damp deceleration
        rotationVelocity.current.y *= 0.98;
        rotationVelocity.current.x *= 0.98;
        
        // Idle ambient rotation
        if (Math.abs(rotationVelocity.current.y) < 0.0005) {
          currentAngles.y += 0.0015;
        }
      } else {
        currentAngles = { ...angles };
      }

      const cosX = Math.cos(currentAngles.x);
      const sinX = Math.sin(currentAngles.x);
      const cosY = Math.cos(currentAngles.y);
      const sinY = Math.sin(currentAngles.y);

      const cx = width / 2;
      const cy = height / 2;

      // Draw 3D Grid / Globe Wireframe
      ctx.strokeStyle = theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.06)' : 'rgba(37, 99, 235, 0.04)';
      ctx.lineWidth = 1;
      
      // Draw parallels (latitudinal rings)
      for (let latVal = -Math.PI / 2.5; latVal <= Math.PI / 2.5; latVal += Math.PI / 6) {
        ctx.beginPath();
        const rLat = R * Math.cos(latVal);
        const yLat = R * Math.sin(latVal);
        
        for (let angle = 0; angle <= Math.PI * 2 + 0.1; angle += 0.1) {
          const xOrig = rLat * Math.sin(angle);
          const zOrig = rLat * Math.cos(angle);
          
          // Apply Y rotation
          const x1 = xOrig * cosY - zOrig * sinY;
          const z1 = xOrig * sinY + zOrig * cosY;
          
          // Apply X rotation
          const y2 = yLat * cosX - z1 * sinX;
          const z2 = yLat * sinX + z1 * cosX;
          
          const pers = 260 / (260 + z2);
          const sx = cx + x1 * pers;
          const sy = cy + y2 * pers;
          
          if (angle === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      // Draw meridians (longitudinal rings)
      for (let lonVal = 0; lonVal < Math.PI; lonVal += Math.PI / 4) {
        ctx.beginPath();
        for (let angle = -Math.PI; angle <= Math.PI + 0.1; angle += 0.1) {
          const xOrig = R * Math.cos(angle) * Math.sin(lonVal);
          const yOrig = R * Math.sin(angle);
          const zOrig = R * Math.cos(angle) * Math.cos(lonVal);
          
          const x1 = xOrig * cosY - zOrig * sinY;
          const z1 = xOrig * sinY + zOrig * cosY;
          const y2 = yOrig * cosX - z1 * sinX;
          const z2 = yOrig * sinX + z1 * cosX;
          
          const pers = 260 / (260 + z2);
          const sx = cx + x1 * pers;
          const sy = cy + y2 * pers;
          
          if (angle === -Math.PI) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      // Draw Central Admin Server Node (0, 0, 0)
      const serverSx = cx;
      const serverSy = cy;
      const glowGrad = ctx.createRadialGradient(serverSx, serverSy, 0, serverSx, serverSy, 18);
      glowGrad.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
      glowGrad.addColorStop(1, 'rgba(59, 130, 246, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(serverSx, serverSy, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2563EB';
      ctx.beginPath();
      ctx.arc(serverSx, serverSy, 5, 0, Math.PI * 2);
      ctx.fill();

      // Project Nodes
      const projectedNodes = nodes.map((node) => {
        // Apply Y rotation
        const x1 = node.x * cosY - node.z * sinY;
        const z1 = node.x * sinY + node.z * cosY;
        
        // Apply X rotation
        const y2 = node.y * cosX - z1 * sinX;
        const z2 = node.y * sinX + z1 * cosX;
        
        const pers = 260 / (260 + z2);
        
        node.sx = cx + x1 * pers;
        node.sy = cy + y2 * pers;
        node.size = 5 * pers;
        return { node, z: z2 };
      });

      // Sort by depth (back to front)
      projectedNodes.sort((a, b) => b.z - a.z);

      // Draw Node connections to the central hub
      projectedNodes.forEach(({ node }) => {
        // Draw links with alpha based on node status and depth
        const depthAlpha = Math.max(0.1, Math.min(1.0, (200 - node.z) / 200));
        let strokeColor = 'rgba(156, 163, 175, 0.15)';
        let lineWidth = 1;
        
        if (node.status === 'live') {
          strokeColor = `rgba(22, 163, 74, ${0.3 * depthAlpha})`;
          lineWidth = 1.5;
        } else if (activeSite && node.site.id === activeSite.id) {
          strokeColor = `rgba(37, 99, 235, ${0.5 * depthAlpha})`;
          lineWidth = 2;
        }
        
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(node.sx, node.sy);
        // Draw slightly curved lines to make it look holographic
        const controlX = (node.sx + serverSx) / 2 + (node.sy - serverSy) * 0.1;
        const controlY = (node.sy + serverSy) / 2 - (node.sx - serverSx) * 0.1;
        ctx.quadraticCurveTo(controlX, controlY, serverSx, serverSy);
        ctx.stroke();
      });

      // Draw flowing packets along the links
      flowParticles.forEach((particle) => {
        const node = nodes[particle.nodeIndex];
        if (!node) return;
        
        particle.progress += particle.speed;
        if (particle.progress >= 1) particle.progress = 0;
        
        // Quadratic curve interpolation
        const controlX = (node.sx + serverSx) / 2 + (node.sy - serverSy) * 0.1;
        const controlY = (node.sy + serverSy) / 2 - (node.sx - serverSx) * 0.1;
        
        const t = 1 - particle.progress; // flowing towards center
        const px = (1-t)*(1-t)*node.sx + 2*(1-t)*t*controlX + t*t*serverSx;
        const py = (1-t)*(1-t)*node.sy + 2*(1-t)*t*controlY + t*t*serverSy;
        
        const ptGlow = ctx.createRadialGradient(px, py, 0, px, py, 5);
        ptGlow.addColorStop(0, particle.color);
        ptGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ptGlow;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Nodes
      let currentHovered: Node3D | null = null;
      let minDistance = 15; // hover boundary in px

      projectedNodes.forEach(({ node, z }) => {
        
        // Pulsing rings for Live nodes
        if (node.status === 'live') {
          const pulseR = node.size * (1.5 + Math.sin(Date.now() * 0.008) * 0.4);
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(node.sx, node.sy, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Active node highlight
        const isActive = activeSite && node.site.id === activeSite.id;
        if (isActive) {
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(node.sx, node.sy, node.size + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Base node circle
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.sx, node.sy, node.size, 0, Math.PI * 2);
        ctx.fill();

        // White core inside node
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(node.sx, node.sy, node.size * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Node labels for close-up nodes
        if (z < 0 && !isDragging) {
          ctx.fillStyle = theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)';
          ctx.font = '500 10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(node.site.name, node.sx, node.sy - node.size - 4);
        }

        // Raycasting for hovered node (from mousePos relative coordinates)
        if (!isDragging) {
          // get relative mouse position from raw cursor state
          const mouseCanvasX = mousePos.x - 15; // offset correction
          const mouseCanvasY = mousePos.y - 15;
          const dx = node.sx - mouseCanvasX;
          const dy = node.sy - mouseCanvasY;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist < minDistance) {
            minDistance = dist;
            currentHovered = node;
          }
        }
      });

      // Update hovered node
      setHoveredNode(currentHovered);
      canvas.style.cursor = currentHovered ? 'pointer' : (isDragging ? 'grabbing' : 'default');

      // Loop rendering
      animationFrameId.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [sites, activeSite, angles, isDragging, mousePos, theme.palette.mode]);

  return (
    <Box ref={containerRef} sx={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', select: 'none' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        style={{ display: 'block', maxWidth: '100%' }}
      />
      
      {/* 3D Float HUD Overlay */}
      {hoveredNode && (
        <Paper
          elevation={12}
          sx={{
            position: 'absolute',
            left: mousePos.x,
            top: mousePos.y,
            p: 1.5,
            minWidth: 160,
            pointerEvents: 'none',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: theme.palette.mode === 'dark' 
              ? 'linear-gradient(135deg, rgba(21, 31, 51, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(243, 244, 246, 0.95) 100%)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            zIndex: 10,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Box 
              sx={{ 
                width: 7, 
                height: 7, 
                borderRadius: '50%', 
                bgcolor: hoveredNode.color,
                animation: hoveredNode.status === 'live' ? 'pulse 1.5s infinite' : 'none'
              }} 
            />
            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '12px' }}>
              {hoveredNode.site.name}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '10px', mb: 0.25 }}>
            <Icon name="MapPin" size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {hoveredNode.site.location || 'Unknown location'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '10px' }}>
            <Icon name="Activity" size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Status: <span style={{ color: hoveredNode.color, fontWeight: 600 }}>{getSiteStatus(hoveredNode.site).label}</span>
          </Typography>
          {hoveredNode.site.client_version && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '9px', mt: 0.5, fontFamily: 'mono' }}>
              Ver: v{hoveredNode.site.client_version}
            </Typography>
          )}
          <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', fontSize: '9px', mt: 0.5, fontWeight: 500, textAlign: 'right' }}>
            Click to inspect →
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
