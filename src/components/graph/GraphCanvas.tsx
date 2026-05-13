import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { SearchBar } from './SearchBar';
import { useProjectFilters } from '@/lib/filterStore';
import { computeNodeVisibility } from '@/lib/filterLogic';
import { globalTransformRef } from '@/lib/transformRef';

interface Props {
  projectId: string;
  highlightedClusterId?: string | null;
  onCountsChange?: (visible: number, total: number) => void;
  selectedKeywordId?: string | null;
  onSelectKeyword?: (id: string | null) => void;
}

export interface GraphCanvasHandle {
  zoomToCluster: (clusterId: string) => void;
  zoomToKeyword: (kwId: string) => void;
  resetZoom: () => void;
}

interface HoverState {
  node: GraphNode;
  screenX: number;
  screenY: number;
}

interface Particle {
  linkIdx: number;
  t: number;
  speed: number;
  size: number;
}

interface NodeOpacity {
  current: number;
  target: number;
}

interface DragState {
  cluster: ClusterMetaNode;
  startMouseX: number;
  startMouseY: number;
  startClusterX: number;
  startClusterY: number;
  childOffsets: Map<string, { dx: number; dy: number }>;
}

const FADE_IN_MS = 1200;
const ABSENT_CLUSTER_COLOR = '#f59e0b';
const OPACITY_LERP = 0.18;

export const GraphCanvas = forwardRef<GraphCanvasHandle, Props>(function GraphCanvas(
  { projectId, highlightedClusterId, onCountsChange, selectedKeywordId, onSelectKeyword },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const renderRef = useRef<() => void>(() => {});
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const quadtreeRef = useRef<d3.Quadtree<GraphNode> | null>(null);
  const fadeStartRef = useRef<number>(performance.now());
  const particlesRef = useRef<Particle[]>([]);
  const opacityMapRef = useRef<Map<string, NodeOpacity>>(new Map());
  const simRef = useRef<d3.Simulation<GraphNode, undefined> | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hover, setHover] = useState<HoverState | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showGlow, setShowGlow] = useState(true);
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(null);

  const selectedId = selectedKeywordId ?? null;
  const setSelectedId = (id: string | null) => onSelectKeyword?.(id);

  const filters = useProjectFilters(projectId);

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

  // Compute visibility (changes with filters or graph).
  const visibility = useMemo(() => {
    if (!graph) return { visible: new Set<string>(), visibleKwCount: 0, totalKwCount: 0 };
    return computeNodeVisibility(graph.nodes, filters);
  }, [graph, filters]);

  // Update opacity targets when visibility changes.
  useEffect(() => {
    if (!graph) return;
    const map = opacityMapRef.current;
    for (const n of graph.nodes) {
      if (!map.has(n.id)) map.set(n.id, { current: 1, target: 1 });
      const info = map.get(n.id)!;
      info.target = visibility.visible.has(n.id) ? 1 : 0;
    }
    // Cleanup orphans (KWs supprimés).
    for (const id of map.keys()) {
      if (!graph.nodes.find((n) => n.id === id)) map.delete(id);
    }
  }, [graph, visibility]);

  // Expose counts to parent.
  useEffect(() => {
    onCountsChange?.(visibility.visibleKwCount, visibility.totalKwCount);
  }, [visibility.visibleKwCount, visibility.totalKwCount, onCountsChange]);

  // ---------------------------------------------------------------- imperative handle
  useImperativeHandle(ref, () => ({
    zoomToCluster: (clusterId: string) => {
      if (!graph || !canvasRef.current || !zoomRef.current) return;
      const t = fitClusterToViewport(graph.nodes, clusterId, size.width, size.height, 0.8);
      if (!t) return;
      d3.select(canvasRef.current).transition().duration(500).call(zoomRef.current.transform, t);
    },
    zoomToKeyword: (kwId: string) => {
      if (!graph || !canvasRef.current || !zoomRef.current) return;
      const node = graph.nodes.find((n) => n.id === kwId);
      if (!node || node.x === undefined || node.y === undefined) return;
      const scale = 2.5;
      const t = d3.zoomIdentity
        .translate(size.width / 2 - node.x * scale, size.height / 2 - node.y * scale)
        .scale(scale);
      d3.select(canvasRef.current).transition().duration(500).call(zoomRef.current.transform, t);
    },
    resetZoom: () => {
      if (!canvasRef.current || !zoomRef.current) return;
      d3.select(canvasRef.current).transition().duration(280).call(zoomRef.current.transform, d3.zoomIdentity);
    },
  }), [graph, size.width, size.height]);

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

  // ---------------------------------------------------------------- render
  renderRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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

    const now = performance.now();
    const fade = Math.max(0, Math.min(1, (now - fadeStartRef.current) / FADE_IN_MS));
    const breathing = 1 + 0.025 * Math.sin(now / 1500);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (!graph) {
      ctx.restore();
      return;
    }

    // Lerp opacities.
    const opMap = opacityMapRef.current;
    for (const info of opMap.values()) {
      info.current += (info.target - info.current) * OPACITY_LERP;
    }

    const t = transformRef.current;
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    drawLinks(ctx, graph.links, fade, t.k, highlightedClusterId, opMap);
    drawParticles(ctx, particlesRef.current, graph.links, fade, opMap);
    drawNodesAndHalos(ctx, graph.nodes, {
      fade,
      breathing,
      showGlow,
      hoveredId: hover?.node.id ?? null,
      selectedId,
      highlightedClusterId,
      zoomK: t.k,
      opacities: opMap,
      searchMatchIds,
    });

    drawClusterAndCenterLabels(ctx, graph.nodes, t.k, fade, opMap);
    if (showLabels) {
      drawKeywordLabels(ctx, graph.nodes, t, fade, opMap);
    }

    ctx.restore();
  };

  // ---------------------------------------------------------------- continuous RAF
  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    const loop = () => {
      if (cancelled) return;
      renderRef.current();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // ---------------------------------------------------------------- simulation
  useEffect(() => {
    if (!graph || size.width === 0) return;

    fadeStartRef.current = performance.now();
    placeInitialPositions(graph.nodes, size.width, size.height);

    particlesRef.current = [];
    graph.links.forEach((l, idx) => {
      if (l.kind !== 'center-cluster') return;
      particlesRef.current.push({ linkIdx: idx, t: Math.random(), speed: 0.00015, size: 1.6 });
      particlesRef.current.push({ linkIdx: idx, t: Math.random(), speed: 0.00012, size: 1.2 });
    });

    const sim = d3
      .forceSimulation<GraphNode>(graph.nodes)
      .alpha(1)
      .alphaDecay(0.02);
    simRef.current = sim;
    sim
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(graph.links)
          .id((d) => d.id)
          .distance((l) => {
            if (l.kind === 'center-cluster') return 240;
            if (l.kind === 'cluster-cluster') return 280;
            if (l.kind === 'cluster-keyword') return 60;
            return 50;
          })
          .strength((l) => {
            if (l.kind === 'center-cluster') return 0.55;
            if (l.kind === 'cluster-cluster') return 0.05;
            if (l.kind === 'cluster-keyword') return 0.5;
            return 0.06;
          }),
      )
      .force(
        'charge',
        d3
          .forceManyBody<GraphNode>()
          .strength((d) => (d.kind === 'center' ? -1400 : d.kind === 'cluster' ? -550 : -45))
          .distanceMax(900),
      )
      .force(
        'collide',
        d3.forceCollide<GraphNode>().radius((d) => d.radius + 2).strength(0.85),
      );

    sim.on('tick', () => {
      const cn = graph.nodes.find((n) => n.kind === 'center');
      if (cn) {
        cn.fx = size.width / 2;
        cn.fy = size.height / 2;
        cn.x = cn.fx;
        cn.y = cn.fy;
      }
      quadtreeRef.current = d3
        .quadtree<GraphNode>()
        .x((d) => d.x ?? 0)
        .y((d) => d.y ?? 0)
        .addAll(graph.nodes);
    });

    return () => {
      sim.stop();
      sim.on('tick', null);
    };
  }, [graph, size.width, size.height]);

  // ---------------------------------------------------------------- particles loop
  useEffect(() => {
    let cancelled = false;
    let last = performance.now();
    const update = () => {
      if (cancelled) return;
      const now = performance.now();
      const dt = now - last;
      last = now;
      for (const p of particlesRef.current) {
        p.t += p.speed * dt;
        if (p.t > 1) p.t -= 1;
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------- zoom (filter exclut les clusters pour le drag)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const selection = d3.select<HTMLCanvasElement, unknown>(canvas);
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 5])
      .filter((event) => {
        if (event.button) return false;
        if (event.type === 'mousedown') {
          const tree = quadtreeRef.current;
          if (tree) {
            const rect = canvas.getBoundingClientRect();
            const sx = event.clientX - rect.left;
            const sy = event.clientY - rect.top;
            const tr = transformRef.current;
            const wx = (sx - tr.x) / tr.k;
            const wy = (sy - tr.y) / tr.k;
            const found = tree.find(wx, wy, 60);
            if (
              found &&
              found.kind === 'cluster' &&
              found.x !== undefined &&
              found.y !== undefined &&
              (wx - found.x) ** 2 + (wy - found.y) ** 2 <= found.radius ** 2
            ) {
              return false; // notre drag handler prend le relais
            }
          }
        }
        return true;
      })
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        // Synchronise la ref globale pour le parallax du Starfield.
        globalTransformRef.current = event.transform;
      });
    zoomRef.current = zoom;
    selection.call(zoom);
    globalTransformRef.current = d3.zoomIdentity;
    return () => {
      selection.on('.zoom', null);
      globalTransformRef.current = d3.zoomIdentity;
    };
  }, []);

  // ---------------------------------------------------------------- pointer events (hover, click, drag, dblclick)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;

    const findNodeAt = (x: number, y: number): GraphNode | null => {
      const tree = quadtreeRef.current;
      if (!tree) return null;
      const found = tree.find(x, y, 60);
      if (!found || found.x === undefined || found.y === undefined) return null;
      const op = opacityMapRef.current.get(found.id);
      if (op && op.current < 0.2) return null;
      const dx = x - found.x;
      const dy = y - found.y;
      if (dx * dx + dy * dy > found.radius * found.radius) return null;
      return found;
    };

    const screenToWorld = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const tr = transformRef.current;
      return { sx, sy, wx: (sx - tr.x) / tr.k, wy: (sy - tr.y) / tr.k };
    };

    let downStart: { x: number; y: number } | null = null;

    const onMove = (e: MouseEvent) => {
      if (dragRef.current) return;
      const { sx, sy, wx, wy } = screenToWorld(e);
      const node = findNodeAt(wx, wy);
      if (node && node.kind === 'cluster') canvas.style.cursor = 'grab';
      else if (node && isClickable(node)) canvas.style.cursor = 'pointer';
      else canvas.style.cursor = 'grab';
      if (node) setHover({ node, screenX: sx, screenY: sy });
      else setHover(null);
    };

    const onLeave = () => {
      setHover(null);
      canvas.style.cursor = 'grab';
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      downStart = { x: e.clientX, y: e.clientY };
      const { wx, wy } = screenToWorld(e);
      const node = findNodeAt(wx, wy);
      if (node?.kind === 'cluster' && node.x !== undefined && node.y !== undefined) {
        // Démarre le drag.
        const offsets = new Map<string, { dx: number; dy: number }>();
        for (const n of graph.nodes) {
          if (n.kind !== 'keyword' || n.clusterId !== node.clusterId) continue;
          if (n.x === undefined || n.y === undefined) continue;
          offsets.set(n.id, { dx: n.x - node.x, dy: n.y - node.y });
        }
        dragRef.current = {
          cluster: node,
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startClusterX: node.x,
          startClusterY: node.y,
          childOffsets: offsets,
        };
        node.fx = node.x;
        node.fy = node.y;
        if (simRef.current) {
          simRef.current.alphaTarget(0).stop();
        }
        canvas.style.cursor = 'grabbing';
      }
    };

    const onDocMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const tr = transformRef.current;
      const dx = (e.clientX - drag.startMouseX) / tr.k;
      const dy = (e.clientY - drag.startMouseY) / tr.k;
      const newX = drag.startClusterX + dx;
      const newY = drag.startClusterY + dy;
      drag.cluster.fx = newX;
      drag.cluster.fy = newY;
      drag.cluster.x = newX;
      drag.cluster.y = newY;
      for (const [kwId, offset] of drag.childOffsets) {
        const kw = graph.nodes.find((n) => n.id === kwId);
        if (!kw) continue;
        kw.x = newX + offset.dx;
        kw.y = newY + offset.dy;
        kw.vx = 0;
        kw.vy = 0;
      }
    };

    const onDocUp = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (drag) {
        // Persiste la position en Dexie (cluster reste pinned).
        if (drag.cluster.fx !== null && drag.cluster.fy !== null && drag.cluster.fx !== undefined) {
          const px = drag.cluster.fx;
          const py = drag.cluster.fy ?? null;
          drag.cluster.manualX = px;
          drag.cluster.manualY = py;
          db.clusters
            .update(drag.cluster.clusterId, { manualX: px, manualY: py })
            .catch((err: unknown) => console.error('cluster save', err));
        }
        if (simRef.current) simRef.current.alpha(0.2).restart();
        dragRef.current = null;
        canvas.style.cursor = 'grab';
        return;
      }
      // click détection (déplacement minimal).
      if (downStart) {
        const dx = e.clientX - downStart.x;
        const dy = e.clientY - downStart.y;
        if (dx * dx + dy * dy < 25) {
          const { wx, wy } = screenToWorld(e);
          const node = findNodeAt(wx, wy);
          if (node && node.kind === 'keyword') setSelectedId(node.id);
          else if (!node) setSelectedId(null);
        }
        downStart = null;
      }
    };

    const onDblClick = (e: MouseEvent) => {
      const { wx, wy } = screenToWorld(e);
      const node = findNodeAt(wx, wy);
      if (node?.kind === 'cluster' && zoomRef.current) {
        const t = fitClusterToViewport(graph.nodes, node.clusterId, size.width, size.height, 0.8);
        if (t) {
          d3.select(canvas).transition().duration(500).call(zoomRef.current.transform, t);
        }
      }
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('dblclick', onDblClick);
    document.addEventListener('mousemove', onDocMove);
    document.addEventListener('mouseup', onDocUp);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('dblclick', onDblClick);
      document.removeEventListener('mousemove', onDocMove);
      document.removeEventListener('mouseup', onDocUp);
    };
  }, [graph, size.width, size.height]);

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

  const isLoading = !graph;
  const isEmpty = graph !== null && graph.nodes.filter((n) => n.kind === 'keyword').length === 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{
        // Vignette légère au centre, transparente en bord pour laisser les
        // étoiles du Starfield apparaître.
        background:
          'radial-gradient(ellipse at center, rgba(15, 15, 46, 0.55) 0%, rgba(15, 15, 46, 0.15) 45%, transparent 80%)',
      }}
    >
      <DotGrid />
      <canvas ref={canvasRef} className="block" style={{ cursor: 'grab' }} />
      {hover && <NodeTooltip hover={hover} />}
      {graph && <Legend nodes={graph.nodes} />}
      {graph && (
        <SearchBar
          nodes={graph.nodes}
          onChange={setSearchMatchIds}
          onSelect={(kwId) => {
            if (!canvasRef.current || !zoomRef.current) return;
            const node = graph.nodes.find((n) => n.id === kwId);
            if (!node || node.x === undefined || node.y === undefined) return;
            const scale = 2.5;
            const t = d3.zoomIdentity
              .translate(size.width / 2 - node.x * scale, size.height / 2 - node.y * scale)
              .scale(scale);
            d3.select(canvasRef.current).transition().duration(500).call(zoomRef.current.transform, t);
            setSelectedId(kwId);
          }}
        />
      )}
      <GraphToolbar
        onZoomIn={() => programmaticZoom(1.5)}
        onZoomOut={() => programmaticZoom(1 / 1.5)}
        onReset={onReset}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels((v) => !v)}
        showGlow={showGlow}
        onToggleGlow={() => setShowGlow((v) => !v)}
      />
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
});

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
  const orbit = Math.min(width, height) * 0.32;
  const clusterPos = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < N; i++) {
    const c = clusterMetas[i]!;
    if (c.manualX !== null && c.manualX !== undefined && c.manualY !== null && c.manualY !== undefined) {
      // Position manuelle : pin via fx/fy.
      c.x = c.manualX;
      c.y = c.manualY;
      c.fx = c.manualX;
      c.fy = c.manualY;
    } else {
      const angle = (i / N) * Math.PI * 2 - Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      c.x = cx + orbit * Math.cos(angle);
      c.y = cy + orbit * Math.sin(angle);
    }
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

function getOp(map: Map<string, NodeOpacity>, id: string): number {
  return map.get(id)?.current ?? 1;
}

function drawLinks(
  ctx: CanvasRenderingContext2D,
  links: GraphLink[],
  fade: number,
  zoomK: number,
  highlightedClusterId: string | null | undefined,
  opacityMap: Map<string, NodeOpacity>,
): void {
  for (const l of links) {
    const s = l.source as GraphNode;
    const t = l.target as GraphNode;
    if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) continue;

    const linkOp = Math.min(getOp(opacityMap, s.id), getOp(opacityMap, t.id));
    if (linkOp < 0.02) continue;

    const involvesHighlight =
      highlightedClusterId &&
      ((s.kind === 'cluster' && (s as ClusterMetaNode).clusterId === highlightedClusterId) ||
        (t.kind === 'cluster' && (t as ClusterMetaNode).clusterId === highlightedClusterId) ||
        (s.kind === 'keyword' && (s as KeywordNode).clusterId === highlightedClusterId) ||
        (t.kind === 'keyword' && (t as KeywordNode).clusterId === highlightedClusterId));
    const dim = highlightedClusterId && !involvesHighlight ? 0.25 : 1;

    let baseOpacity: number;
    let lineWidth: number;
    if (l.kind === 'center-cluster') {
      baseOpacity = 0.28;
      lineWidth = 1.5;
    } else if (l.kind === 'cluster-cluster') {
      baseOpacity = Math.min(0.35, 0.05 + (l.weight ?? 1) * 0.04);
      lineWidth = Math.min(1.6, 0.5 + (l.weight ?? 1) * 0.18);
    } else if (l.kind === 'cluster-keyword') {
      baseOpacity = 0.16;
      lineWidth = 0.8;
    } else {
      baseOpacity = 0.07;
      lineWidth = 0.6;
    }

    const finalAlpha = baseOpacity * fade * dim * linkOp;
    try {
      const grad = ctx.createLinearGradient(s.x, s.y, t.x, t.y);
      grad.addColorStop(0, withAlpha(l.color, finalAlpha));
      grad.addColorStop(1, withAlpha('#ffffff', finalAlpha * 0.35));
      ctx.strokeStyle = grad;
    } catch {
      ctx.strokeStyle = withAlpha(l.color, finalAlpha);
    }
    ctx.lineWidth = lineWidth / Math.max(0.5, zoomK / 1.5);
    if (l.kind === 'cluster-cluster') ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  links: GraphLink[],
  fade: number,
  opacityMap: Map<string, NodeOpacity>,
): void {
  for (const p of particles) {
    const link = links[p.linkIdx];
    if (!link) continue;
    const s = link.source as GraphNode;
    const t = link.target as GraphNode;
    if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) continue;
    const linkOp = Math.min(getOp(opacityMap, s.id), getOp(opacityMap, t.id));
    if (linkOp < 0.1) continue;
    const x = s.x + (t.x - s.x) * p.t;
    const y = s.y + (t.y - s.y) * p.t;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, p.size * 4);
    grad.addColorStop(0, `rgba(255, 255, 255, ${0.55 * fade * linkOp})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, p.size * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface NodeRenderState {
  fade: number;
  breathing: number;
  showGlow: boolean;
  hoveredId: string | null;
  selectedId: string | null;
  highlightedClusterId: string | null | undefined;
  zoomK: number;
  opacities: Map<string, NodeOpacity>;
  searchMatchIds: Set<string> | null;
}

function searchDim(s: NodeRenderState, id: string): number {
  if (!s.searchMatchIds) return 1;
  return s.searchMatchIds.has(id) ? 1 : 0.18;
}

function drawNodesAndHalos(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  s: NodeRenderState,
): void {
  if (s.showGlow) {
    for (const n of nodes) {
      if (n.kind !== 'keyword' || !n.isGap) continue;
      const op = getOp(s.opacities, n.id);
      if (op < 0.05) continue;
      drawGapGlow(ctx, n, s.fade * op);
    }
  }
  for (const n of nodes) {
    const op = getOp(s.opacities, n.id);
    if (op < 0.05) continue;
    drawAmbientHalo(ctx, n, s.fade * op);
  }

  for (const n of nodes) {
    if (n.kind === 'keyword') drawKeyword(ctx, n, s);
  }
  for (const n of nodes) {
    if (n.kind === 'cluster') drawCluster(ctx, n, s);
  }
  for (const n of nodes) {
    if (n.kind === 'center') drawCenter(ctx, n, s);
  }
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;
    if (n.id === s.selectedId) drawOutline(ctx, n, '#e6e6f0', 2);
    else if (n.id === s.hoveredId && isClickable(n)) drawOutline(ctx, n, '#e6e6f0', 1.5);
  }
}

function getDepthOpacity(radius: number): number {
  const t = Math.max(0, Math.min(1, (radius - 2) / 22));
  return 0.45 + 0.55 * t;
}

function drawAmbientHalo(ctx: CanvasRenderingContext2D, n: GraphNode, alpha: number): void {
  if (n.x === undefined || n.y === undefined) return;
  const color =
    n.kind === 'keyword'
      ? n.primaryColor
      : n.kind === 'center'
        ? n.color
        : '#9aa0ff';
  const inner = n.radius;
  const outer = n.radius + 3;
  const grad = ctx.createRadialGradient(n.x, n.y, inner, n.x, n.y, outer);
  grad.addColorStop(0, withAlpha(color, 0.08 * alpha));
  grad.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(n.x, n.y, outer, 0, Math.PI * 2);
  ctx.fill();
}

function drawGapGlow(ctx: CanvasRenderingContext2D, n: KeywordNode, alpha: number): void {
  if (n.x === undefined || n.y === undefined) return;
  const inner = n.radius;
  const outer = n.radius * 2.6 + 2;
  const grad = ctx.createRadialGradient(n.x, n.y, inner, n.x, n.y, outer);
  grad.addColorStop(0, withAlpha(n.primaryColor, 0.35 * alpha));
  grad.addColorStop(0.55, withAlpha(n.primaryColor, 0.12 * alpha));
  grad.addColorStop(1, withAlpha(n.primaryColor, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(n.x, n.y, outer, 0, Math.PI * 2);
  ctx.fill();
}

function drawKeyword(
  ctx: CanvasRenderingContext2D,
  n: KeywordNode,
  s: NodeRenderState,
): void {
  if (n.x === undefined || n.y === undefined) return;
  const op = getOp(s.opacities, n.id);
  if (op < 0.05) return;
  const dim = s.highlightedClusterId && n.clusterId !== s.highlightedClusterId ? 0.3 : 1;
  const baseAlpha = getDepthOpacity(n.radius) * s.fade * dim * op * searchDim(s, n.id);
  const r = n.radius * (s.breathing - 0.005);
  ctx.globalAlpha = baseAlpha;
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fillStyle = n.primaryColor;
  ctx.fill();
  // Bordure subtile.
  ctx.strokeStyle = `rgba(10, 10, 26, ${0.5 * baseAlpha})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCluster(
  ctx: CanvasRenderingContext2D,
  n: ClusterMetaNode,
  s: NodeRenderState,
): void {
  if (n.x === undefined || n.y === undefined) return;
  const op = getOp(s.opacities, n.id);
  if (op < 0.05) return;
  const dim = s.highlightedClusterId && n.clusterId !== s.highlightedClusterId ? 0.4 : 1;
  ctx.globalAlpha = s.fade * dim * op * searchDim(s, n.id);
  const absent = !n.isMyCovered;
  const r = n.radius * s.breathing;

  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fillStyle = absent ? withAlpha(ABSENT_CLUSTER_COLOR, 0.12) : 'rgba(99, 102, 241, 0.32)';
  ctx.fill();

  if (absent) {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = withAlpha(ABSENT_CLUSTER_COLOR, 0.95);
    ctx.lineWidth = 1.6;
  } else {
    ctx.strokeStyle = 'rgba(199, 200, 255, 0.85)';
    ctx.lineWidth = 1.5;
  }
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawCenter(
  ctx: CanvasRenderingContext2D,
  n: CenterNode,
  s: NodeRenderState,
): void {
  if (n.x === undefined || n.y === undefined) return;
  ctx.globalAlpha = s.fade;
  const r = n.radius * s.breathing;
  const now = performance.now();

  // Halo externe pulsant (4 sec, 15-25% opacité) — donne vie au centre.
  const pulse = 0.20 + 0.05 * Math.sin((2 * Math.PI * now) / 4000);
  const outerR = r * 3.6;
  const outerGrad = ctx.createRadialGradient(n.x, n.y, r * 2, n.x, n.y, outerR);
  outerGrad.addColorStop(0, withAlpha(n.color, pulse));
  outerGrad.addColorStop(1, withAlpha(n.color, 0));
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(n.x, n.y, outerR, 0, Math.PI * 2);
  ctx.fill();

  // Halo interne statique (intense, focus).
  const innerR = r * 2.4;
  const grad = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, innerR);
  grad.addColorStop(0, withAlpha(n.color, 0.55));
  grad.addColorStop(1, withAlpha(n.color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(n.x, n.y, innerR, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fillStyle = n.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
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
  fade: number,
  opacityMap: Map<string, NodeOpacity>,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const baseSize = Math.max(11, Math.min(16, 13 / Math.max(0.6, zoomK)));
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;
    const op = getOp(opacityMap, n.id);
    if (op < 0.05) continue;
    if (n.kind === 'cluster') {
      const absent = !n.isMyCovered;
      ctx.font = `${absent ? 600 : 500} ${baseSize}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillStyle = absent
        ? withAlpha(ABSENT_CLUSTER_COLOR, 0.95 * fade * op)
        : `rgba(255, 255, 255, ${0.92 * fade * op})`;
      const labelText = absent ? `⚠ ${n.name}` : n.name;
      ctx.fillText(labelText, n.x, n.y + n.radius + 8);
      if (absent) {
        ctx.font = `500 ${Math.max(9, baseSize - 3)}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.fillStyle = withAlpha(ABSENT_CLUSTER_COLOR, 0.7 * fade * op);
        ctx.fillText('Absent', n.x, n.y + n.radius + 8 + baseSize + 2);
      }
    } else if (n.kind === 'center') {
      ctx.font = `600 ${baseSize + 2}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
      ctx.fillText(n.label, n.x, n.y + n.radius + 10);
    }
  }
}

function drawKeywordLabels(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  transform: d3.ZoomTransform,
  fade: number,
  opacityMap: Map<string, NodeOpacity>,
): void {
  const zoomK = transform.k;
  // Apparition progressive : pas de label sous 0.9×, fade-in 0.9→1.4.
  const baseOpacity = clamp((zoomK - 0.9) / 0.5, 0, 1);
  if (baseOpacity <= 0) return;

  // Top N par cluster, agrandi avec le zoom.
  const topN = zoomK < 1.5 ? 3 : zoomK < 2 ? 5 : zoomK < 3 ? 10 : Number.POSITIVE_INFINITY;

  const byCluster = new Map<string, KeywordNode[]>();
  for (const n of nodes) {
    if (n.kind !== 'keyword') continue;
    const list = byCluster.get(n.clusterId) ?? [];
    list.push(n);
    byCluster.set(n.clusterId, list);
  }

  const candidates: KeywordNode[] = [];
  for (const list of byCluster.values()) {
    list.sort((a, b) => b.volume - a.volume);
    for (const n of list.slice(0, topN === Number.POSITIVE_INFINITY ? list.length : topN)) {
      candidates.push(n);
    }
  }
  // Tri global par volume desc → priorité de placement en cas de collision.
  candidates.sort((a, b) => b.volume - a.volume);

  const fontInWorld = 10 / Math.max(0.6, zoomK / 1.5);
  const fontInScreen = fontInWorld * zoomK;

  // Bboxes en coords écran.
  const placed: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const keep: KeywordNode[] = [];

  for (const n of candidates) {
    if (n.x === undefined || n.y === undefined) continue;
    const op = getOp(opacityMap, n.id);
    if (op < 0.1) continue;

    const screenX = n.x * zoomK + transform.x;
    const screenY = (n.y + n.radius + 4) * zoomK + transform.y;
    const halfW = n.keyword.length * fontInScreen * 0.31;
    const halfH = fontInScreen * 0.55;
    const bbox = {
      x1: screenX - halfW,
      y1: screenY,
      x2: screenX + halfW,
      y2: screenY + halfH * 1.5,
    };

    let overlaps = false;
    for (const b of placed) {
      if (bbox.x1 < b.x2 && bbox.x2 > b.x1 && bbox.y1 < b.y2 && bbox.y2 > b.y1) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    placed.push(bbox);
    keep.push(n);
  }

  ctx.font = `500 ${fontInWorld}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const n of keep) {
    if (n.x === undefined || n.y === undefined) continue;
    const op = getOp(opacityMap, n.id);
    ctx.fillStyle = `rgba(230, 230, 240, ${0.55 * baseOpacity * fade * op})`;
    ctx.fillText(n.keyword, n.x, n.y + n.radius + 4);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function fitClusterToViewport(
  nodes: GraphNode[],
  clusterId: string,
  width: number,
  height: number,
  padding: number,
): d3.ZoomTransform | null {
  const meta = nodes.find(
    (n): n is ClusterMetaNode => n.kind === 'cluster' && n.clusterId === clusterId,
  );
  if (!meta) return null;
  const subset: GraphNode[] = [meta];
  for (const n of nodes) {
    if (n.kind === 'keyword' && n.clusterId === clusterId) subset.push(n);
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of subset) {
    if (n.x === undefined || n.y === undefined) continue;
    minX = Math.min(minX, n.x - n.radius);
    minY = Math.min(minY, n.y - n.radius);
    maxX = Math.max(maxX, n.x + n.radius);
    maxY = Math.max(maxY, n.y + n.radius);
  }
  if (!isFinite(minX)) return null;
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const scale = Math.min((width * padding) / Math.max(1, bboxW), (height * padding) / Math.max(1, bboxH), 4);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return d3.zoomIdentity
    .translate(width / 2 - cx * scale, height / 2 - cy * scale)
    .scale(scale);
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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
          {!node.isMyCovered && (
            <p className="mt-1 text-amber-300">
              ⚠ Cluster non couvert ({node.competitorOnlyKwCount} KWs concurrents)
            </p>
          )}
          {node.isMyCovered && (
            <p className="mt-1 text-text-muted">
              {node.myKwCount} KWs à toi · {node.competitorOnlyKwCount} aux concurrents
            </p>
          )}
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
    <div className="absolute right-3 top-16 z-10 flex flex-col gap-1 rounded-md border border-border-subtle bg-bg-surface/85 p-2 backdrop-blur">
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
      <div className="mt-1 flex flex-col gap-0.5 border-t border-border-subtle pt-1.5 text-[10px] text-text-muted">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_3px_rgba(251,191,36,0.45)]" />
          glow = opportunité
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-amber-400"
            style={{ background: 'rgba(245, 158, 11, 0.12)' }}
          />
          cluster non couvert
        </div>
      </div>
    </div>
  );
}

function DotGrid() {
  return (
    <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" aria-hidden="true">
      <defs>
        <pattern id="dot-grid" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.9" fill="rgba(160, 160, 192, 0.07)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-grid)" />
    </svg>
  );
}
