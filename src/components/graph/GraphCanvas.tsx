import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as d3 from 'd3';
import { db } from '@/lib/db';
import {
  buildGraph,
  isClickable,
  type CenterNode,
  type ClusterMetaNode,
  type GraphNode,
  type GraphLink,
  type KeywordNode,
} from './graphLayout';
import { GraphToolbar } from './GraphToolbar';
import { KeywordDetailSidebar } from './KeywordDetailSidebar';

interface Props {
  projectId: string;
}

interface HoverState {
  node: GraphNode;
  screenX: number;
  screenY: number;
}

const FADE_IN_MS = 1200;

export function GraphCanvas({ projectId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const renderRef = useRef<() => void>(() => {});
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const quadtreeRef = useRef<d3.Quadtree<GraphNode> | null>(null);
  const fadeStartRef = useRef<number>(performance.now());

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hover, setHover] = useState<HoverState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showGlow, setShowGlow] = useState(true);

  // ---------------------------------------------------------------- data
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const keywords = useLiveQuery(
    () => db.keywords.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const competitors = useLiveQuery(
    () => db.competitors.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const clusters = useLiveQuery(
    () => db.clusters.where('projectId').equals(projectId).toArray(),
    [projectId],
  );

  const graph = useMemo(() => {
    if (!keywords || !competitors || !clusters || !project) return null;
    return buildGraph({
      keywords,
      competitors,
      clusters,
      myDomain: project.myDomain,
      projectName: project.name,
    });
  }, [keywords, competitors, clusters, project]);

  const selectedNode = useMemo<KeywordNode | null>(() => {
    if (!selectedId || !graph) return null;
    const n = graph.nodes.find((nd) => nd.id === selectedId);
    return n && n.kind === 'keyword' ? n : null;
  }, [selectedId, graph]);

  // ---------------------------------------------------------------- resize
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------------------------------------------------------------- render fn (via ref)
  renderRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = size.width;
    const h = size.height;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const elapsed = performance.now() - fadeStartRef.current;
    const fade = Math.max(0, Math.min(1, elapsed / FADE_IN_MS));

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const t = transformRef.current;
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    drawLinks(ctx, graph.links, fade);
    drawNodes(ctx, graph.nodes, {
      fade,
      showGlow,
      hoveredId: hover?.node.id ?? null,
      selectedId,
    });

    if (showLabels && t.k > 1.5) {
      drawKeywordLabels(ctx, graph.nodes, t.k);
    }
    drawClusterAndCenterLabels(ctx, graph.nodes, t.k);

    ctx.restore();
  };

  // ---------------------------------------------------------------- simulation
  useEffect(() => {
    if (!graph || size.width === 0) return;

    fadeStartRef.current = performance.now();
    placeInitialPositions(graph.nodes, size.width, size.height);

    const sim = d3
      .forceSimulation<GraphNode>(graph.nodes)
      .alpha(1)
      .alphaDecay(0.02)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(graph.links)
          .id((d) => d.id)
          .distance((l) => {
            if (l.kind === 'center-cluster') return 220;
            if (l.kind === 'cluster-keyword') return 60;
            return 50;
          })
          .strength((l) => {
            if (l.kind === 'center-cluster') return 0.6;
            if (l.kind === 'cluster-keyword') return 0.5;
            return 0.06;
          }),
      )
      .force(
        'charge',
        d3
          .forceManyBody<GraphNode>()
          .strength((d) => (d.kind === 'center' ? -1200 : d.kind === 'cluster' ? -500 : -40))
          .distanceMax(900),
      )
      .force(
        'collide',
        d3.forceCollide<GraphNode>().radius((d) => d.radius + 2).strength(0.85),
      );

    sim.on('tick', () => {
      // Maintient le centre fixe (au cas où une force le déplacerait).
      const cn = graph.nodes.find((n) => n.kind === 'center');
      if (cn) {
        cn.x = size.width / 2;
        cn.y = size.height / 2;
        cn.fx = size.width / 2;
        cn.fy = size.height / 2;
      }
      // Reconstruit le quadtree.
      quadtreeRef.current = d3
        .quadtree<GraphNode>()
        .x((d) => d.x ?? 0)
        .y((d) => d.y ?? 0)
        .addAll(graph.nodes);
      renderRef.current();
    });

    return () => {
      sim.stop();
      sim.on('tick', null);
    };
  }, [graph, size.width, size.height]);

  // ---------------------------------------------------------------- zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const selection = d3.select<HTMLCanvasElement, unknown>(canvas);
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        renderRef.current();
      });
    zoomRef.current = zoom;
    selection.call(zoom);
    return () => {
      selection.on('.zoom', null);
    };
  }, []);

  // ---------------------------------------------------------------- pointer events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;

    const findNodeAt = (x: number, y: number): GraphNode | null => {
      const tree = quadtreeRef.current;
      if (!tree) return null;
      const found = tree.find(x, y, 60);
      if (!found || found.x === undefined || found.y === undefined) return null;
      const dx = x - found.x;
      const dy = y - found.y;
      if (dx * dx + dy * dy > found.radius * found.radius) return null;
      return found;
    };

    const screenToWorld = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const t = transformRef.current;
      return { sx, sy, wx: (sx - t.x) / t.k, wy: (sy - t.y) / t.k };
    };

    const onMove = (e: MouseEvent) => {
      const { sx, sy, wx, wy } = screenToWorld(e);
      const node = findNodeAt(wx, wy);
      canvas.style.cursor = node && isClickable(node) ? 'pointer' : 'grab';
      if (node) setHover({ node, screenX: sx, screenY: sy });
      else setHover(null);
    };
    const onLeave = () => {
      setHover(null);
      canvas.style.cursor = 'grab';
    };
    const onClick = (e: MouseEvent) => {
      const { wx, wy } = screenToWorld(e);
      const node = findNodeAt(wx, wy);
      if (node && node.kind === 'keyword') {
        setSelectedId(node.id);
      } else {
        setSelectedId(null);
      }
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
    };
  }, [graph]);

  // ---------------------------------------------------------------- repaint on cosmetic state
  useEffect(() => {
    renderRef.current();
  }, [hover, showLabels, showGlow, selectedId, size]);

  // ---------------------------------------------------------------- toolbar handlers
  const programmaticZoom = (factor: number) => {
    const canvas = canvasRef.current;
    const zoom = zoomRef.current;
    if (!canvas || !zoom) return;
    d3.select(canvas).transition().duration(220).call(zoom.scaleBy, factor);
  };
  const onReset = () => {
    const canvas = canvasRef.current;
    const zoom = zoomRef.current;
    if (!canvas || !zoom) return;
    d3.select(canvas).transition().duration(280).call(zoom.transform, d3.zoomIdentity);
  };

  // ---------------------------------------------------------------- render
  // On rend toujours le container + canvas pour que les refs et effets
  // (zoom, hover) s'attachent dès le mount, même pendant le chargement.
  const isLoading = !graph;
  const isEmpty = graph !== null && graph.nodes.filter((n) => n.kind === 'keyword').length === 0;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-bg-base">
      <DotGrid />
      <canvas ref={canvasRef} className="block" style={{ cursor: 'grab' }} />
      {hover && <NodeTooltip hover={hover} />}
      {graph && <Legend nodes={graph.nodes} />}
      <GraphToolbar
        onZoomIn={() => programmaticZoom(1.5)}
        onZoomOut={() => programmaticZoom(1 / 1.5)}
        onReset={onReset}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels((v) => !v)}
        showGlow={showGlow}
        onToggleGlow={() => setShowGlow((v) => !v)}
      />
      {selectedNode && (
        <KeywordDetailSidebar
          node={selectedNode}
          projectId={projectId}
          onClose={() => setSelectedId(null)}
        />
      )}
      {isLoading && (
        <Overlay>
          <p className="text-sm text-text-muted">Chargement…</p>
        </Overlay>
      )}
      {isEmpty && (
        <Overlay>
          <div className="rounded-lg border border-dashed border-border-subtle bg-bg-surface/80 p-8 text-center backdrop-blur">
            <p className="text-text-secondary">Pas encore de mots-clés.</p>
            <p className="mt-1 text-xs text-text-muted">
              Importe au moins un CSV pour voir le graph.
            </p>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {children}
    </div>
  );
}

// ============================================================================
// Initial layout
// ============================================================================

function placeInitialPositions(nodes: GraphNode[], width: number, height: number): void {
  const cx = width / 2;
  const cy = height / 2;
  const center = nodes.find((n) => n.kind === 'center');
  if (center) {
    center.x = cx;
    center.y = cy;
    center.fx = cx;
    center.fy = cy;
  }
  const clusterMetas = nodes.filter((n): n is ClusterMetaNode => n.kind === 'cluster');
  const N = clusterMetas.length;
  const orbit = Math.min(width, height) * 0.3;
  const clusterPos = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2 + Math.random() * 0.4;
    const c = clusterMetas[i]!;
    c.x = cx + orbit * Math.cos(angle);
    c.y = cy + orbit * Math.sin(angle);
    clusterPos.set(c.id, { x: c.x, y: c.y });
  }
  for (const n of nodes) {
    if (n.kind !== 'keyword') continue;
    const cp = clusterPos.get(`__cluster__:${n.clusterId}`);
    if (!cp) continue;
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 50;
    n.x = cp.x + dist * Math.cos(angle);
    n.y = cp.y + dist * Math.sin(angle);
  }
}

// ============================================================================
// Drawing
// ============================================================================

function drawLinks(ctx: CanvasRenderingContext2D, links: GraphLink[], fade: number): void {
  for (const l of links) {
    const s = l.source as GraphNode;
    const t = l.target as GraphNode;
    if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) continue;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    if (l.kind === 'center-cluster') {
      ctx.strokeStyle = withAlpha(l.color, 0.22 * fade);
      ctx.lineWidth = 1.6;
    } else if (l.kind === 'cluster-keyword') {
      ctx.strokeStyle = withAlpha(l.color, 0.15 * fade);
      ctx.lineWidth = 0.8;
    } else {
      ctx.strokeStyle = withAlpha(l.color, 0.07 * fade);
      ctx.lineWidth = 0.6;
    }
    ctx.stroke();
  }
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  state: { fade: number; showGlow: boolean; hoveredId: string | null; selectedId: string | null },
): void {
  // Pass 1 — glow (sous tous les nodes).
  if (state.showGlow) {
    for (const n of nodes) {
      if (n.kind === 'keyword' && n.isGap) drawGlow(ctx, n, state.fade);
    }
  }
  // Pass 2 — keywords.
  for (const n of nodes) {
    if (n.kind === 'keyword') drawKeyword(ctx, n, state.fade);
  }
  // Pass 3 — cluster meta-nodes.
  for (const n of nodes) {
    if (n.kind === 'cluster') drawCluster(ctx, n, state.fade);
  }
  // Pass 4 — center.
  for (const n of nodes) {
    if (n.kind === 'center') drawCenter(ctx, n, state.fade);
  }
  // Pass 5 — outline pour le hover et la sélection.
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;
    if (n.id === state.selectedId) drawOutline(ctx, n, '#e6e6f0', 2);
    else if (n.id === state.hoveredId && isClickable(n)) drawOutline(ctx, n, '#e6e6f0', 1.5);
  }
}

function drawGlow(ctx: CanvasRenderingContext2D, n: KeywordNode, fade: number): void {
  if (n.x === undefined || n.y === undefined) return;
  const innerR = n.radius;
  const outerR = n.radius * 2.4;
  const color = n.sources[0]?.color ?? '#ffffff';
  const grad = ctx.createRadialGradient(n.x, n.y, innerR, n.x, n.y, outerR);
  grad.addColorStop(0, withAlpha(color, 0.55 * fade));
  grad.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(n.x, n.y, outerR, 0, Math.PI * 2);
  ctx.fill();
}

function drawKeyword(ctx: CanvasRenderingContext2D, n: KeywordNode, fade: number): void {
  if (n.x === undefined || n.y === undefined) return;
  ctx.globalAlpha = fade;
  if (n.sources.length === 1) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    ctx.fillStyle = n.sources[0]!.color;
    ctx.fill();
  } else if (n.sources.length > 1) {
    const slice = (Math.PI * 2) / n.sources.length;
    for (let i = 0; i < n.sources.length; i++) {
      const start = i * slice - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(n.x, n.y);
      ctx.arc(n.x, n.y, n.radius, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = n.sources[i]!.color;
      ctx.fill();
    }
  }
  ctx.beginPath();
  ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(10, 10, 26, 0.55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCluster(ctx: CanvasRenderingContext2D, n: ClusterMetaNode, fade: number): void {
  if (n.x === undefined || n.y === undefined) return;
  ctx.globalAlpha = fade;
  ctx.beginPath();
  ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(99, 102, 241, 0.35)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(199, 200, 255, 0.85)';
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCenter(ctx: CanvasRenderingContext2D, n: CenterNode, fade: number): void {
  if (n.x === undefined || n.y === undefined) return;
  ctx.globalAlpha = fade;
  // Halo permanent.
  const grad = ctx.createRadialGradient(n.x, n.y, n.radius, n.x, n.y, n.radius * 2.2);
  grad.addColorStop(0, withAlpha(n.color, 0.5));
  grad.addColorStop(1, withAlpha(n.color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(n.x, n.y, n.radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
  ctx.fillStyle = n.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawOutline(
  ctx: CanvasRenderingContext2D,
  n: GraphNode,
  color: string,
  width: number,
): void {
  if (n.x === undefined || n.y === undefined) return;
  ctx.beginPath();
  ctx.arc(n.x, n.y, n.radius + 3, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawClusterAndCenterLabels(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  zoomK: number,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const baseSize = Math.max(11, Math.min(16, 13 / Math.max(0.6, zoomK)));
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;
    if (n.kind === 'cluster') {
      ctx.font = `500 ${baseSize}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(n.name, n.x, n.y + n.radius + 6);
    } else if (n.kind === 'center') {
      ctx.font = `600 ${baseSize + 2}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(n.label, n.x, n.y + n.radius + 8);
    }
  }
}

function drawKeywordLabels(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  zoomK: number,
): void {
  ctx.font = `500 ${9 / Math.max(0.6, zoomK / 1.5)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillStyle = 'rgba(230, 230, 240, 0.5)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const n of nodes) {
    if (n.kind !== 'keyword') continue;
    if (n.x === undefined || n.y === undefined) continue;
    ctx.fillText(n.keyword, n.x, n.y + n.radius + 3);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================================================
// UI overlays
// ============================================================================

function NodeTooltip({ hover }: { hover: HoverState }) {
  const { node, screenX, screenY } = hover;
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-xs rounded-md border border-border-strong bg-bg-elevated p-3 text-xs shadow-xl"
      style={{ left: screenX + 14, top: screenY + 14 }}
    >
      {node.kind === 'keyword' && <KeywordTooltipBody node={node} />}
      {node.kind === 'cluster' && (
        <>
          <p className="font-semibold text-text-primary">{node.name}</p>
          <p className="mt-1 font-mono text-text-muted">
            {node.kwCount} KWs · vol {node.totalVolume.toLocaleString('fr-FR')}
          </p>
        </>
      )}
      {node.kind === 'center' && (
        <>
          <p className="font-semibold text-text-primary">{node.label}</p>
          <p className="mt-1 font-mono text-text-muted">{node.domain}</p>
        </>
      )}
    </div>
  );
}

function KeywordTooltipBody({ node }: { node: KeywordNode }) {
  return (
    <>
      <p className="font-semibold text-text-primary">{node.keyword}</p>
      <p className="mt-1 text-text-muted">{node.clusterName}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-text-secondary">
        <span>vol {node.volume.toLocaleString('fr-FR')}</span>
        {node.kd !== null && <span>KD {node.kd}</span>}
        {node.intent.length > 0 && (
          <span>
            {node.intent.map((i) => i.charAt(0).toUpperCase() + i.charAt(1)).join('/')}
          </span>
        )}
      </div>
      <div className="mt-2 space-y-1">
        {node.sources.map((s) => (
          <div key={s.domain} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-mono text-text-secondary">
              {s.label}
              {s.position !== null && <span className="text-text-muted"> · pos {s.position}</span>}
            </span>
          </div>
        ))}
      </div>
      {node.isGap && (
        <p className="mt-2 text-xs text-amber-300">⚡ Opportunité — non positionné</p>
      )}
    </>
  );
}

function Legend({ nodes }: { nodes: GraphNode[] }) {
  const sites = new Map<string, { color: string; label: string; isMe: boolean }>();
  for (const n of nodes) {
    if (n.kind !== 'keyword') continue;
    for (const s of n.sources) {
      if (!sites.has(s.domain)) sites.set(s.domain, { color: s.color, label: s.label, isMe: s.isMe });
    }
  }
  if (sites.size === 0) return null;
  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-md border border-border-subtle bg-bg-surface/85 p-2 backdrop-blur">
      {[...sites.values()]
        .sort((a, b) => (a.isMe === b.isMe ? a.label.localeCompare(b.label) : a.isMe ? -1 : 1))
        .map((s) => (
          <div key={s.label} className="flex items-center gap-2 pr-2 text-xs">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className={s.isMe ? 'font-semibold text-text-primary' : 'text-text-secondary'}>
              {s.label}
            </span>
          </div>
        ))}
      <div className="mt-1 flex items-center gap-2 border-t border-border-subtle pt-1.5 text-[10px] text-text-muted">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_3px_rgba(251,191,36,0.45)]" />
        glow = gap / opportunité
      </div>
    </div>
  );
}

function DotGrid() {
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <defs>
        <pattern id="dot-grid" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.9" fill="rgba(160, 160, 192, 0.07)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-grid)" />
    </svg>
  );
}
