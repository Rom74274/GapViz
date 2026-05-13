import * as d3 from 'd3';

// Ref globale qui suit le transform du graph principal. Utilisé par le
// Starfield pour son effet parallax sans recourir à un store ou un context
// (évite les re-renders au moindre événement de zoom).
export const globalTransformRef: { current: d3.ZoomTransform } = {
  current: d3.zoomIdentity,
};
