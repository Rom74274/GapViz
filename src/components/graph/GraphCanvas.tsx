import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as d3 from 'd3';
import { db } from '@/lib/db';
import {
  buildGraphNodes,
  clusterCentroids,
  computeClusterAnchors,
  uniqueClusterIds,
  type GraphNode,
} from './graphLayout';

interface Props {
  projectId: string;
}

interface Hover {
  node: GraphNode;
  screenX: number;
  screenY: number;
}

export function GraphCanvas({ projectId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const renderRef = useRef<() => void>(() => {});
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hover, setHover] = useState<Hover | null>(null);

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

  const nodes = useMemo(() => {
    if (!keywords || !competitors || !clusters) return null;
    return buildGraphNodes({ keywords, competitors, clusters });
  }, [keywords, competitors, clusters]);

  // Render fn — recréée à chaque render React, accessible via renderRef pour
  // que la simulation et le hover utilisent toujours la version courante.
  renderRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes) return;
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

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const t = transformRef.current;
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    drawClusterLabels(ctx, nodes, t.k);

    for (const n of nodes) {
      if (n.x === undefined || n.y === undefined) continue;
      drawNode(ctx, n);
    }

    if (hover) {
      const n = hover.node;
      if (n.x !== undefined && n.y !== undefined) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#e6e6f0';
        ctx.lineWidth = 1.5 / t.k;
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  // ResizeObserver — adapte le canvas au container.
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

  // Force simulation — démarre / redémarre quand les nodes ou la taille changent.
  useEffect(() => {
    if (!nodes || nodes.length === 0 || size.width === 0) return;

    const anchors = computeClusterAnchors(uniqueClusterIds(nodes), size.width, size.height);

    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .alpha(1)
      .alphaDecay(0.04)
      .force(
        'charge',
        d3.forceManyBody<GraphNode>().strength((d) => -10 - d.radius * 1.5),
      )
      .force(
        'collide',
        d3.forceCollide<GraphNode>().radius((d) => d.radius + 2).strength(0.9),
      )
      .force(
        'x',
        d3
          .forceX<GraphNode>((d) => anchors.get(d.clusterId)?.x ?? size.width / 2)
          .strength(0.15),
      )
      .force(
        'y',
        d3
          .forceY<GraphNode>((d) => anchors.get(d.clusterId)?.y ?? size.height / 2)
          .strength(0.15),
      );

    sim.on('tick', () => renderRef.current());

    return () => {
      sim.stop();
      sim.on('tick', null);
    };
  }, [nodes, size.width, size.height]);

  // Zoom / pan setup.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const selection = d3.select<HTMLCanvasElement, unknown>(canvas);
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.2, 6])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        renderRef.current();
      });
    selection.call(zoom);
    return () => {
      selection.on('.zoom', null);
    };
  }, []);

  // Hover detection.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes) return;

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const t = transformRef.current;
      const wx = (x - t.x) / t.k;
      const wy = (y - t.y) / t.k;
      const node = findNodeAt(nodes, wx, wy);
      if (node) setHover({ node, screenX: x, screenY: y });
      else setHover(null);
    };
    const onLeave = () => setHover(null);

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [nodes]);

  // Re-render quand le hover ou la taille changent (la simulation pousse les
  // ticks, mais ces changements doivent aussi déclencher un repaint).
  useEffect(() => {
    renderRef.current();
  }, [hover, size]);

  if (!nodes) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg border border-border-subtle bg-bg-surface text-text-muted">
        Chargement…
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg border border-dashed border-border-subtle bg-bg-surface/50 text-center text-text-muted">
        <div>
          <p>Pas encore de mots-clés.</p>
          <p className="mt-1 text-xs">Importe au moins un CSV pour voir le graph.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[640px] overflow-hidden rounded-lg border border-border-subtle bg-bg-base"
    >
      <canvas
        ref={canvasRef}
        className="block cursor-grab active:cursor-grabbing"
      />
      {hover && <NodeTooltip hover={hover} />}
      <Legend nodes={nodes} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Drawing
// ----------------------------------------------------------------------------

function drawNode(ctx: CanvasRenderingContext2D, n: GraphNode): void {
  const { x, y, radius, sources } = n;
  if (x === undefined || y === undefined) return;

  if (sources.length === 1) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = sources[0]!.color;
    ctx.fill();
  } else {
    const sliceAngle = (Math.PI * 2) / sources.length;
    for (let i = 0; i < sources.length; i++) {
      const start = i * sliceAngle - Math.PI / 2;
      const end = start + sliceAngle;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = sources[i]!.color;
      ctx.fill();
    }
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(10, 10, 26, 0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawClusterLabels(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  zoomK: number,
): void {
  const centroids = clusterCentroids(nodes);
  const fontSize = Math.max(10, Math.min(22, 14 / zoomK));
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(160, 160, 192, 0.65)';
  for (const { x, y, name } of centroids.values()) {
    ctx.fillText(name, x, y - 50 / zoomK);
  }
}

function findNodeAt(nodes: GraphNode[], x: number, y: number): GraphNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    if (n.x === undefined || n.y === undefined) continue;
    const dx = x - n.x;
    const dy = y - n.y;
    if (dx * dx + dy * dy <= n.radius * n.radius) return n;
  }
  return null;
}

// ----------------------------------------------------------------------------
// Tooltip + legend
// ----------------------------------------------------------------------------

function NodeTooltip({ hover }: { hover: Hover }) {
  const { node, screenX, screenY } = hover;
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-xs rounded-md border border-border-strong bg-bg-elevated p-3 text-xs shadow-xl"
      style={{ left: screenX + 12, top: screenY + 12 }}
    >
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
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="font-mono text-text-secondary">
              {s.label}
              {s.position !== null && (
                <span className="text-text-muted"> · pos {s.position}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ nodes }: { nodes: GraphNode[] }) {
  const sites = new Map<string, { color: string; label: string; isMe: boolean }>();
  for (const n of nodes) {
    for (const s of n.sources) {
      if (!sites.has(s.domain)) {
        sites.set(s.domain, { color: s.color, label: s.label, isMe: s.isMe });
      }
    }
  }
  if (sites.size === 0) return null;

  return (
    <div className="absolute left-3 top-3 flex flex-col gap-1 rounded-md border border-border-subtle bg-bg-surface/85 p-2 backdrop-blur">
      {[...sites.values()]
        .sort((a, b) => (a.isMe === b.isMe ? a.label.localeCompare(b.label) : a.isMe ? -1 : 1))
        .map((s) => (
          <div key={s.label} className="flex items-center gap-2 pr-2 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span
              className={s.isMe ? 'font-semibold text-text-primary' : 'text-text-secondary'}
            >
              {s.label}
            </span>
          </div>
        ))}
    </div>
  );
}
