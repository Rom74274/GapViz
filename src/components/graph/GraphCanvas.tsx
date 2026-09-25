import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
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
  pickPrimaryColor,
  type CenterNode,
  type ClusterMetaNode,
  type GraphNode,
  type GraphLink,
  type KeywordNode,
} from './graphLayout';
import { GraphToolbar } from './GraphToolbar';
import { SearchBar } from './SearchBar';
import { useProjectFilters } from '@/lib/filterStore';
import { computeNodeVisibility, computeOpportunityGlow } from '@/lib/filterLogic';
import { globalTransformRef } from '@/lib/transformRef';
import { useAuth } from '@/hooks/useAuth';
import { PLAN_LIMITS } from '@/lib/plans';

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
const OPACITY_LERP = 0.18;
// Design handoff : couleurs de données (à NE PAS unifier), glow opportunité.
const OPP_COLOR = '#FFD43B';
const CENTER_COLOR = '#4C9FFF';
// Layout déterministe (phyllotaxie) — seed stable pour un rendu reproductible.
const GRAPH_RNG_SEED = 20260724;
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  const layoutSigRef = useRef<string>(''); // signature structurelle pour éviter le rejeu du fade
  const prevPosRef = useRef<Map<string, { x: number; y: number; radius: number }>>(new Map()); // positions + rayon conservés entre rebuilds
  const particlesRef = useRef<Particle[]>([]);
  const opacityMapRef = useRef<Map<string, NodeOpacity>>(new Map());
  const simRef = useRef<d3.Simulation<GraphNode, undefined> | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const fittedSigRef = useRef<string>(''); // signature du dernier zoom-to-fit auto

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hover, setHover] = useState<HoverState | null>(null);
  const showLabels = true; // labels de KW gérés séparément (voir drawKeywordLabels)
  const showGlow = true; // glow des opportunités toujours actif
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(null);

  const { profile } = useAuth();
  const showWatermark = PLAN_LIMITS[profile?.plan ?? 'free'].watermark;

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
    if (!graph) return { opacityTargets: new Map<string, number>(), visibleKwCount: 0, totalKwCount: 0 };
    return computeNodeVisibility(graph.nodes, filters);
  }, [graph, filters]);

  // Vraies opportunités (top des gaps par score) → intensité du glow. Dépend
  // seulement du graphe (recalcul rare), pas des filtres.
  const oppGlow = useMemo(
    () => (graph ? computeOpportunityGlow(graph.nodes) : new Map<string, number>()),
    [graph],
  );

  // Recalcul des couleurs quand on restreint les concurrents (activeSites) : un
  // mot-clé partagé se RECOLORE sur les seules sources encore sélectionnées (sa
  // couleur cesse d'être celle d'un concurrent retiré). null = pas de restriction.
  const effectiveColors = useMemo(() => {
    if (!graph || filters.activeSites === null) return null;
    const active = new Set(filters.activeSites);
    const map = new Map<string, string>();
    for (const n of graph.nodes) {
      if (n.kind !== 'keyword') continue;
      const selected = n.sources.filter((sr) => active.has(sr.domain));
      if (selected.length > 0) map.set(n.id, pickPrimaryColor(selected));
    }
    return map;
  }, [graph, filters.activeSites]);

  // Update opacity targets when visibility changes.
  useEffect(() => {
    if (!graph) return;
    const map = opacityMapRef.current;
    for (const n of graph.nodes) {
      if (!map.has(n.id)) map.set(n.id, { current: 1, target: 1 });
      const info = map.get(n.id)!;
      info.target = visibility.opacityTargets.get(n.id) ?? 0;
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
      if (!canvasRef.current || !zoomRef.current || !graph) return;
      const t = fitAllToViewport(graph.nodes, size.width, size.height, 0.9) ?? d3.zoomIdentity;
      d3.select(canvasRef.current).transition().duration(400).call(zoomRef.current.transform, t);
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
    const breathing = 1; // épuré : plus de pulsation des nœuds

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

    const cn0 = graph.nodes.find((n) => n.kind === 'center');
    if (cn0 && cn0.x != null && cn0.y != null) {
      drawStars(ctx, cn0.x, cn0.y, size.width, size.height, fade);
    }
    drawLinks(ctx, graph.links, fade, t.k, highlightedClusterId, opMap);
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
      oppGlow: filters.gapOnly ? oppGlow : null,
      effectiveColors,
    });

    drawClusterAndCenterLabels(ctx, graph.nodes, t.k, fade, opMap);
    // Noms de mots-clés retirés du canvas (illisibles en masse) — le nom
    // s'affiche via le tooltip au survol. `showLabels` est conservé pour le
    // toggle mais ne rend plus les libellés de mots-clés.
    void showLabels;
    void drawKeywordLabels;

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

  // ---------------------------------------------------------------- layout
  // Placement déterministe (phyllotaxie du handoff), pas de force-simulation :
  // les positions sont fixes → rendu stable, pas de jitter.
  // useLayoutEffect : s'exécute AVANT le repaint → les nœuds ont toujours une
  // position quand le navigateur peint (plus de frame vide au re-render / drag).
  useLayoutEffect(() => {
    if (!graph || size.width === 0) return;
    // Ne rejoue le fade-in que si la STRUCTURE change (projet/keywords), pas quand
    // on ne fait que déplacer un cluster (sinon drag = « rechargement » visuel).
    const sig = `${graph.nodes.length}:${graph.links.length}:${size.width}x${size.height}`;
    const structureChanged = sig !== layoutSigRef.current;
    if (structureChanged) {
      // Vraie (re)construction du layout (projet/keywords/redimensionnement).
      fadeStartRef.current = performance.now();
      layoutSigRef.current = sig;
      placeInitialPositions(graph.nodes, size.width, size.height);
    } else {
      // Simple mise à jour (ex. drag d'un cluster) : on RÉUTILISE les positions
      // déjà calculées → pas de re-packing (donc pas de gel ni d'écran vide).
      const prev = prevPosRef.current;
      for (const n of graph.nodes) {
        const p = prev.get(n.id);
        if (!p) continue;
        n.x = p.x;
        n.y = p.y;
        // Restaure aussi le rayon calculé par le layout : sinon le nœud
        // fraîchement reconstruit garde le rayon (plus grand) de buildGraph
        // → le hub de cluster grossit d'un coup au drag.
        n.radius = p.radius;
        if (n.kind !== 'keyword') {
          n.fx = p.x;
          n.fy = p.y;
        }
      }
    }
    // Sans force-simulation d3, personne ne résout les liens (id → nœud) : on le
    // fait ici, sinon source/target restent des strings et aucune ligne ne se dessine.
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const l of graph.links) {
      if (typeof l.source === 'string') l.source = byId.get(l.source) ?? l.source;
      if (typeof l.target === 'string') l.target = byId.get(l.target) ?? l.target;
    }
    quadtreeRef.current = d3
      .quadtree<GraphNode>()
      .x((d) => d.x ?? 0)
      .y((d) => d.y ?? 0)
      .addAll(graph.nodes);
    simRef.current = null; // pas de simulation ; le drag est null-gardé
    // Mémorise positions + rayon pour la prochaine reconstruction du graph.
    const posMap = new Map<string, { x: number; y: number; radius: number }>();
    for (const n of graph.nodes) {
      if (n.x != null && n.y != null) posMap.set(n.id, { x: n.x, y: n.y, radius: n.radius });
    }
    prevPosRef.current = posMap;
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
      .scaleExtent([0.04, 6])
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

  // ---------------------------------------------------------------- zoom-to-fit auto à l'ouverture
  // Le layout étant calculé à sa taille naturelle (souvent plus grande que la
  // fenêtre), on cadre l'ensemble une fois par changement de structure/taille.
  // Les positions sont déjà posées (useLayoutEffect de layout, qui tourne avant).
  useEffect(() => {
    const canvas = canvasRef.current;
    const zoom = zoomRef.current;
    if (!graph || size.width === 0 || !canvas || !zoom) return;
    const sig = `${graph.nodes.length}:${size.width}x${size.height}`;
    if (sig === fittedSigRef.current) return; // déjà cadré (filtre/drag ne refit pas)
    const t = fitAllToViewport(graph.nodes, size.width, size.height, 0.9);
    if (!t) return;
    fittedSigRef.current = sig;
    d3.select(canvas).call(zoom.transform, t); // cadrage instantané
  }, [graph, size.width, size.height]);

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
      // Hitbox = rayon dessiné (+ petite marge de confort), pas le rayon volume.
      const hitR = nodeDisplayRadius(found) + 2.5;
      if (dx * dx + dy * dy > hitR * hitR) return null;
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
        // Fige les positions actuelles (avec le déplacement) : le rebuild du graph
        // les réutilisera au lieu de re-packer → pas d'écran vide, cluster pinné.
        const posMap = new Map<string, { x: number; y: number; radius: number }>();
        for (const n of graph.nodes) {
          if (n.x != null && n.y != null) posMap.set(n.id, { x: n.x, y: n.y, radius: n.radius });
        }
        prevPosRef.current = posMap;
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
    if (!canvas || !zoom || !graph) return;
    const t = fitAllToViewport(graph.nodes, size.width, size.height, 0.9) ?? d3.zoomIdentity;
    d3.select(canvas).transition().duration(400).call(zoom.transform, t);
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
      {showWatermark && (
        <span className="pointer-events-none absolute bottom-3 right-4 select-none font-mono text-[10px] uppercase tracking-wider text-text-muted/40">
          Star Gap Free
        </span>
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

// Rayon de dessin d'un mot-clé (proportionnel au volume). Source unique de
// vérité, utilisée pour le rendu ET pour la résolution de collisions.
// La plage est volontairement large (1.6 → 8) pour que la TAILLE révèle
// l'ampleur : un gros volume = un gros point = une grosse opportunité, un
// petit volume = un petit point. Avant, le plafond à 3.4 écrasait tout le
// monde à la même taille dès qu'il y avait un peu de volume.
const LEAF_MIN_R = 1.5;
const LEAF_MAX_R = 9;
function leafDrawRadius(n: KeywordNode): number {
  // n.radius ∈ [2, 35] (compressé en pow 0.6 depuis le volume). Plage large
  // (1.5 → 9) : la taille du point révèle clairement l'ampleur de l'opportunité.
  // Ce n'est plus contraint par le « fit to viewport » : le layout est calculé à
  // sa densité naturelle (non-chevauchement garanti par le pas de la spirale,
  // cf. stepBase) puis un zoom-to-fit cadre l'ensemble. Le zoom d3 scale TOUT le
  // contexte (positions ET rayons) → le non-chevauchement tient à tout zoom.
  return Math.max(LEAF_MIN_R, Math.min(LEAF_MAX_R, n.radius * 0.4));
}

// Rayon réellement dessiné à l'écran (≠ n.radius qui encode le volume brut).
// Utilisé pour le hit-test du hover ET le cercle de survol → correspondance exacte.
function nodeDisplayRadius(n: GraphNode): number {
  if (n.kind === 'keyword') return leafDrawRadius(n);
  if (n.kind === 'center') return 9;
  return n.radius; // cluster : la sphère du hub
}

// Résolution de collisions : écarte physiquement tout couple de mots-clés qui
// se chevauchent (en tenant compte de leur rayon réel). Grille spatiale →
// quasi O(n) par itération, OK même pour un cluster de plusieurs milliers de KW.
function resolveLeafCollisions(leaves: KeywordNode[]): void {
  const N = leaves.length;
  if (N < 2) return;
  const R = leaves.map(leafDrawRadius);
  const GAP = 1.4; // marge minimale entre deux bords de points
  // La maille doit couvrir le plus gros couple possible : max(R)+max(R)+GAP,
  // sinon deux gros points voisins pourraient se chevaucher sans être testés
  // (voisinage 3×3). On la dimensionne donc sur le rayon max réel.
  let maxR = 0;
  for (const r of R) if (r > maxR) maxR = r;
  const cell = Math.max(9, 2 * maxR + GAP);
  const iterations = N > 1200 ? 8 : 12;
  for (let it = 0; it < iterations; it++) {
    const grid = new Map<string, number[]>();
    for (let i = 0; i < N; i++) {
      const a = leaves[i]!;
      const key = Math.floor((a.x ?? 0) / cell) + ',' + Math.floor((a.y ?? 0) / cell);
      const arr = grid.get(key);
      if (arr) arr.push(i);
      else grid.set(key, [i]);
    }
    for (let i = 0; i < N; i++) {
      const a = leaves[i]!;
      const gx = Math.floor((a.x ?? 0) / cell);
      const gy = Math.floor((a.y ?? 0) / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const arr = grid.get(gx + dx + ',' + (gy + dy));
          if (!arr) continue;
          for (const j of arr) {
            if (j <= i) continue;
            const b = leaves[j]!;
            const ddx = (b.x ?? 0) - (a.x ?? 0);
            const ddy = (b.y ?? 0) - (a.y ?? 0);
            const d = Math.hypot(ddx, ddy) || 0.01;
            const min = R[i]! + R[j]! + GAP;
            if (d < min) {
              const p = (min - d) / 2;
              const ux = ddx / d;
              const uy = ddy / d;
              a.x = (a.x ?? 0) - ux * p;
              a.y = (a.y ?? 0) - uy * p;
              b.x = (b.x ?? 0) + ux * p;
              b.y = (b.y ?? 0) + uy * p;
            }
          }
        }
      }
    }
  }
}

// Layout phyllotaxie (design handoff) : hubs de clusters répartis sur un disque
// (angle d'or → variété de tailles), mots-clés en feuilles rayonnant VERS
// L'EXTÉRIEUR depuis leur hub. Déterministe (seed stable) → stable entre rendus.
function placeInitialPositions(nodes: GraphNode[], width: number, height: number): void {
  const rng = mulberry32(GRAPH_RNG_SEED);
  // Centre du disque dans la zone libre entre les panneaux flottants.
  const leftPad = 320, rightPad = 300, topPad = 40, botPad = 40;
  const cx = (leftPad + (width - rightPad)) / 2;
  const cy = (topPad + (height - botPad)) / 2;

  const center = nodes.find((n) => n.kind === 'center');
  if (center) {
    center.x = cx;
    center.y = cy;
    center.fx = cx;
    center.fy = cy;
  }

  // Mots-clés groupés par cluster.
  const kwByCluster = new Map<string, KeywordNode[]>();
  for (const n of nodes) {
    if (n.kind !== 'keyword') continue;
    const list = kwByCluster.get(n.clusterId) ?? [];
    list.push(n);
    kwByCluster.set(n.clusterId, list);
  }

  const clusterMetas = nodes.filter((n): n is ClusterMetaNode => n.kind === 'cluster');
  // Un blob (bulle) par cluster ; rayon selon le nb de mots-clés ET la taille des
  // plus gros points du cluster (densité size-aware).
  const blobs = clusterMetas.map((c) => {
    const leaves = kwByCluster.get(c.clusterId) ?? [];
    const cnt = leaves.length;
    c.radius = Math.max(6, Math.min(20, 4 + Math.sqrt(cnt) * 0.5)); // sphère du hub (noyau)
    // Rayon de dessin max des feuilles de CE cluster → pas radial de la spirale
    // qui garantit que même les plus gros points ne se chevauchent pas : sur un
    // tournesol, la distance entre voisins ≈ 1.7·SP, donc 1.7·SP ≥ 2·rmax + marge.
    let maxLeafR = LEAF_MIN_R;
    for (const kw of leaves) {
      const r = leafDrawRadius(kw);
      if (r > maxLeafR) maxLeafR = r;
    }
    const stepBase = Math.max(6, (2 * maxLeafR + 3) / 1.7);
    const innerR = c.radius + 4;
    // blobR = rayon RÉEL du nuage de feuilles (spirale de Fermat). L'espace
    // réservé au packing correspond ainsi EXACTEMENT à l'étalement des feuilles
    // → clusters distincts garantis (c'est le découplage qui cassait avant).
    const blobR = Math.sqrt(innerR * innerR + stepBase * stepBase * cnt) + maxLeafR + 2;
    return {
      c,
      stepBase,
      blobR,
      x: cx + (rng() - 0.5) * 80,
      y: cy + (rng() - 0.5) * 80,
    };
  });

  // Packing par relaxation : gravité vers le centre + clairière centrale (Mon
  // site) + répulsion entre bulles → clusters distincts, bien espacés, dans une
  // silhouette globalement ronde (la gravité produit naturellement le cercle).
  const CENTER_KEEP = 34; // dégagement de base autour de « Mon site »
  const GAPB = 20; // écart de base (l'écart visuel est piloté par SPREAD plus bas)
  for (let it = 0; it < 360; it++) {
    for (const b of blobs) {
      b.x += (cx - b.x) * 0.02;
      b.y += (cy - b.y) * 0.02;
    }
    for (const b of blobs) {
      const dx = b.x - cx;
      const dy = b.y - cy;
      const d = Math.hypot(dx, dy) || 0.01;
      const min = CENTER_KEEP + b.blobR;
      if (d < min) {
        const p = min - d;
        b.x += (dx / d) * p;
        b.y += (dy / d) * p;
      }
    }
    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const a = blobs[i]!;
        const b = blobs[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = a.blobR + b.blobR + GAPB; // écart entre clusters
        if (d < min) {
          const p = (min - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          a.x -= ux * p;
          a.y -= uy * p;
          b.x += ux * p;
          b.y += uy * p;
        }
      }
    }
  }

  // Plus de compression « fit to viewport » : le layout est calculé à sa taille
  // NATURELLE (densité qui garantit le non-chevauchement). Le cadrage se fait par
  // un zoom-to-fit à l'ouverture (fitAllToViewport), et comme le zoom d3 scale
  // TOUT le contexte (positions ET rayons des points), le non-chevauchement est
  // préservé à tout niveau de zoom — ce que l'ancienne compression cassait.
  // `SPREAD` écarte les GROUPES entre eux (les KW à l'intérieur ne bougent pas).
  const SPREAD = 1.7; // écart entre groupes de clusters (1 = serré)
  const CLEAR_RADIUS = 110; // rayon vide autour de « Mon site » (aucun cluster dedans)
  const FINAL_GAP = 16; // écart mini entre bords de clusters (px)

  // Positions/tailles finales des clusters (échelle naturelle).
  const fx = blobs.map((b) => cx + (b.x - cx) * SPREAD);
  const fy = blobs.map((b) => cy + (b.y - cy) * SPREAD);
  const fr = blobs.map((b) => b.blobR);

  // Relaxation finale : zone franche centrale + anti-chevauchement entre
  // clusters résolus ENSEMBLE (repousser hors du centre ne recrée plus de
  // collisions entre voisins).
  for (let it = 0; it < 140; it++) {
    for (let i = 0; i < blobs.length; i++) {
      const dx = fx[i]! - cx;
      const dy = fy[i]! - cy;
      const d = Math.hypot(dx, dy) || 0.01;
      const minD = CLEAR_RADIUS + fr[i]!;
      if (d < minD) {
        const p = minD - d;
        fx[i] = fx[i]! + (dx / d) * p;
        fy[i] = fy[i]! + (dy / d) * p;
      }
    }
    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const dx = fx[j]! - fx[i]!;
        const dy = fy[j]! - fy[i]!;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = fr[i]! + fr[j]! + FINAL_GAP;
        if (d < min) {
          const p = (min - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          fx[i] = fx[i]! - ux * p;
          fy[i] = fy[i]! - uy * p;
          fx[j] = fx[j]! + ux * p;
          fy[j] = fy[j]! + uy * p;
        }
      }
    }
  }

  // Positions manuelles (cluster déplacé au drag) : elles priment sur le packing
  // → le cluster reste où l'utilisateur l'a lâché, même après re-layout.
  for (let k = 0; k < blobs.length; k++) {
    const mx = blobs[k]!.c.manualX;
    const my = blobs[k]!.c.manualY;
    if (mx != null && my != null) {
      fx[k] = mx;
      fy[k] = my;
    }
  }

  // Placement des feuilles autour des positions finales résolues.
  for (let k = 0; k < blobs.length; k++) {
    const b = blobs[k]!;
    const bx = fx[k]!;
    const by = fy[k]!;
    b.c.x = bx;
    b.c.y = by;
    b.c.fx = bx;
    b.c.fy = by;
    // Feuilles en spirale de Fermat (tournesol). Densité IDENTIQUE pour tous les
    // clusters : le pas radial est fixe (`SP`), donc l'aire occupée est
    // proportionnelle au nombre de mots-clés (petit cluster = compact, gros =
    // grand, même densité). Anneau partant du bord du hub pour ne pas le masquer.
    const leavesList = kwByCluster.get(b.c.clusterId) ?? [];
    const innerR = b.c.radius + 4;
    const inner2 = innerR * innerR;
    // Pas radial de la spirale = le MÊME stepBase que celui utilisé pour blobR.
    // Ce couplage est impératif : l'étalement réel des feuilles = l'espace réservé
    // → clusters distincts, et stepBase est dimensionné pour que les plus gros
    // points ne se chevauchent pas.
    const SP = b.stepBase; // pas radial par mot-clé (densité size-aware)
    leavesList.forEach((kw, i) => {
      const rr = Math.sqrt(inner2 + SP * SP * (i + 0.5));
      const a = i * 2.399963;
      kw.x = bx + Math.cos(a) * rr;
      kw.y = by + Math.sin(a) * rr;
    });
    // Règle anti-chevauchement : écarte tout couple de points qui se touchent.
    resolveLeafCollisions(leavesList);
  }
}

// ============================================================================
// Drawing
// ============================================================================

function getOp(map: Map<string, NodeOpacity>, id: string): number {
  return map.get(id)?.current ?? 1;
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fade: number,
): void {
  const rng = mulberry32(GRAPH_RNG_SEED);
  const maxR = Math.max(w, h) * 0.75;
  ctx.fillStyle = '#cfd6ff';
  for (let i = 0; i < 160; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * maxR;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.globalAlpha = (0.15 + rng() * 0.4) * fade;
    ctx.beginPath();
    ctx.arc(x, y, rng() * 0.9 + 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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

    // Lignes de vie : seul le lien centre → hub de cluster est visible. Les
    // liens hub→mots-clés (toile) ne sont pas dessinés (illisibles en masse).
    if (l.kind !== 'center-cluster') continue;
    const baseOpacity = 0.34;
    const lineWidth = 1.2;
    const color = '#96a0dc';

    const finalAlpha = baseOpacity * fade * dim * linkOp;
    ctx.strokeStyle = withAlpha(color, finalAlpha);
    ctx.lineWidth = lineWidth / Math.max(0.5, zoomK / 1.5);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
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
  // Filtre « Opportunités » actif : map<id, intensité 0..1> des SEULES vraies
  // opportunités (top des gaps par score). null si le filtre est inactif.
  oppGlow: Map<string, number> | null;
  // Couleurs recalculées quand des concurrents sont retirés (activeSites).
  // null = pas de restriction → on garde n.primaryColor.
  effectiveColors: Map<string, string> | null;
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
  // Plus AUCUN halo/glow diffus (ni autour des clusters, ni des points). Le
  // signal « opportunité » est porté uniquement par le POINT lui-même, qui
  // devient jaune ambré + liseré clair quand c'est une vraie opportunité
  // (top des gaps par score, cf. computeOpportunityGlow) — voir drawKeyword.
  void s.showGlow;
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

function drawKeyword(
  ctx: CanvasRenderingContext2D,
  n: KeywordNode,
  s: NodeRenderState,
): void {
  if (n.x === undefined || n.y === undefined) return;
  const op = getOp(s.opacities, n.id);
  if (op < 0.05) return;
  const dim = s.highlightedClusterId && n.clusterId !== s.highlightedClusterId ? 0.3 : 1;
  const baseAlpha = s.fade * dim * op * searchDim(s, n.id);
  // Taille de la feuille proportionnelle au volume (n.radius encode le volume).
  const oppIntensity = s.oppGlow?.get(n.id);
  // Vraie opportunité : le POINT lui-même devient lumineux (jaune ambré,
  // légèrement agrandi, petit glow serré via shadowBlur + liseré clair) au lieu
  // de sa couleur de cluster. shadowBlur est proportionnel au point → glow fin.
  if (oppIntensity !== undefined) {
    const r = leafDrawRadius(n) * (1 + 0.35 * oppIntensity);
    ctx.globalAlpha = baseAlpha;
    ctx.save();
    ctx.shadowColor = OPP_COLOR;
    ctx.shadowBlur = r * (1.1 + 0.9 * oppIntensity); // petit glow, pas épais
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = OPP_COLOR;
    ctx.fill();
    ctx.fill(); // 2e passe : renforce légèrement la luminosité du halo
    ctx.restore();
    // Liseré clair net (sans ombre) pour bien détacher le point.
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 250, 225, ${0.95 * baseAlpha})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  const r = leafDrawRadius(n);
  ctx.globalAlpha = baseAlpha;
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  // Couleur recalculée si des concurrents sont retirés, sinon couleur d'origine.
  ctx.fillStyle = s.effectiveColors?.get(n.id) ?? n.primaryColor;
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
  const dim = s.highlightedClusterId && n.clusterId !== s.highlightedClusterId ? 0.5 : 1;
  ctx.globalAlpha = s.fade * dim * op * searchDim(s, n.id);
  const r = n.radius;

  // Anneau tireté jaune si cluster non couvert (opportunité), sauf « Sans cluster ».
  if (!n.isMyCovered && n.name !== 'Sans cluster') {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = OPP_COLOR;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Sphère dégradée. « Sans cluster » = gris neutre distinct (pas bleu-violet).
  const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
  if (n.name === 'Sans cluster') {
    grad.addColorStop(0, '#c7b39b');
    grad.addColorStop(1, '#7a6a55');
  } else {
    grad.addColorStop(0, '#c3c8ea');
    grad.addColorStop(1, '#7d84b8');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCenter(
  ctx: CanvasRenderingContext2D,
  n: CenterNode,
  s: NodeRenderState,
): void {
  if (n.x === undefined || n.y === undefined) return;
  ctx.globalAlpha = s.fade;
  const r = 9; // taille fixe (handoff) — le hub central ne doit pas dominer

  // Halo bleu du centre « Mon site » (handoff).
  const glowR = r * 6;
  const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
  grad.addColorStop(0, withAlpha(CENTER_COLOR, 0.5));
  grad.addColorStop(1, withAlpha(CENTER_COLOR, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fillStyle = CENTER_COLOR;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.6;
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
  ctx.arc(n.x, n.y, nodeDisplayRadius(n) + 2, 0, Math.PI * 2);
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
  // Style handoff : plus de labels de clusters (illisibles à cette densité —
  // dispo dans le panneau Clusters + au survol). On ne garde que « Mon site ».
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  const size = Math.max(11, Math.min(14, 12 / Math.max(0.6, zoomK)));
  for (const n of nodes) {
    if (n.kind !== 'center') continue;
    if (n.x === undefined || n.y === undefined) continue;
    const a = fade * getOp(opacityMap, n.id);
    ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = `rgba(6, 8, 16, ${0.92 * a})`;
    ctx.strokeText(n.label, n.x, n.y + 13);
    ctx.fillStyle = `rgba(207, 224, 255, ${a})`;
    ctx.fillText(n.label, n.x, n.y + 13);
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
  // Labels de mots-clés seulement en zoom rapproché (>2×) — vue par défaut épurée.
  const baseOpacity = clamp((zoomK - 2) / 0.6, 0, 1);
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

// Cadre TOUT le graphe (zoom-to-fit à l'ouverture). Le layout est calculé à sa
// taille naturelle → cette transform le ramène entièrement dans la fenêtre. Le
// zoom scale positions ET rayons uniformément, donc aucun chevauchement n'apparaît.
function fitAllToViewport(
  nodes: GraphNode[],
  width: number,
  height: number,
  padding: number,
): d3.ZoomTransform | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;
    const r = nodeDisplayRadius(n);
    minX = Math.min(minX, n.x - r);
    minY = Math.min(minY, n.y - r);
    maxX = Math.max(maxX, n.x + r);
    maxY = Math.max(maxY, n.y + r);
  }
  if (!isFinite(minX)) return null;
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  // Réserve l'emprise des panneaux flottants (gauche ~320, droite ~300) pour que
  // le graphe se cadre dans la zone réellement visible plutôt que sous les panneaux.
  const availW = Math.max(200, width - 320 - 300);
  const availH = Math.max(200, height - 80);
  const scale = Math.min((availW * padding) / Math.max(1, bboxW), (availH * padding) / Math.max(1, bboxH), 2.5);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Centre horizontal = milieu de la zone entre panneaux (320 → width-300).
  const screenCx = (320 + (width - 300)) / 2;
  return d3.zoomIdentity
    .translate(screenCx - cx * scale, height / 2 - cy * scale)
    .scale(scale);
}

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
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {node.clusterName}
      </p>
      <p className="font-semibold text-text-primary">{node.keyword}</p>
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
