import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, forceX, forceY } from "d3-force";

/**
 * Computes a compact, force-directed layout and hard-clamps every node to a
 * bounded radius so disconnected nodes/clusters can never drift off into
 * empty space (see earlier fix notes).
 *
 * When communityById is provided, nodes are additionally pulled toward a
 * per-community "anchor point" arranged in a circle - this is what makes
 * clusters visually separate into distinct regions instead of just being
 * color-coded within one big blob.
 */
export function computeForceLayout(nodes, edges, width = 820, height = 560, communityById = null) {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2;

    const simNodes = nodes.map((n) => ({ id: n.id }));
    const nodeIds = new Set(simNodes.map((n) => n.id));

    const simLinks = edges
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e) => ({ source: e.source, target: e.target }));

    const simulation = forceSimulation(simNodes)
        .force("link", forceLink(simLinks).id((d) => d.id).distance(110).strength(0.6))
        .force("charge", forceManyBody().strength(-320))
        .force("collide", forceCollide(56));

    if (communityById && Object.keys(communityById).length > 0) {
        const communityIds = [...new Set(simNodes.map((n) => communityById[n.id]).filter((c) => c !== undefined))];
        const communityCount = Math.max(1, communityIds.length);
        const clusterRadius = maxRadius * 0.55;
        const centers = {};
        communityIds.forEach((cid, i) => {
            const angle = (2 * Math.PI * i) / communityCount;
            centers[cid] = {
                x: centerX + clusterRadius * Math.cos(angle),
                y: centerY + clusterRadius * Math.sin(angle),
            };
        });

        simulation
            .force("center", forceCenter(centerX, centerY))
            .force("clusterX", forceX((d) => (centers[communityById[d.id]] || { x: centerX }).x).strength(0.35))
            .force("clusterY", forceY((d) => (centers[communityById[d.id]] || { y: centerY }).y).strength(0.35));
    } else {
        simulation
            .force("center", forceCenter(centerX, centerY))
            .force("x", forceX(centerX).strength(0.12))
            .force("y", forceY(centerY).strength(0.12));
    }

    simulation.stop();
    for (let i = 0; i < 350; i++) simulation.tick();

    const positionById = {};
    simNodes.forEach((n) => {
        const dx = n.x - centerX;
        const dy = n.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxRadius) {
            const scale = maxRadius / dist;
            positionById[n.id] = { x: centerX + dx * scale, y: centerY + dy * scale };
        } else {
            positionById[n.id] = { x: n.x, y: n.y };
        }
    });

    return positionById;
}

export function computeNodeDegrees(nodes, edges) {
    const degree = {};
    nodes.forEach((n) => (degree[n.id] = 0));
    edges.forEach((e) => {
        if (degree[e.source] !== undefined) degree[e.source] += 1;
        if (degree[e.target] !== undefined) degree[e.target] += 1;
    });
    return degree;
}

/**
 * Detects communities (tightly-connected groups of nodes) using label
 * propagation - a simple, well-established algorithm: every node starts in
 * its own community, then repeatedly adopts whichever community is most
 * common among its neighbors, until labels stabilize. Runs entirely
 * client-side so it works regardless of whether the Neo4j instance has the
 * Graph Data Science library installed (Aura's free tier typically doesn't).
 *
 * Returns a map of nodeId -> communityIndex (small integers, 0-based,
 * ordered by community size so the largest cluster is always index 0).
 */
export function computeCommunities(nodes, edges) {
    const ids = nodes.map((n) => n.id);
    if (ids.length === 0) return {};

    const neighbors = {};
    ids.forEach((id) => (neighbors[id] = []));
    edges.forEach((e) => {
        if (neighbors[e.source] && neighbors[e.target]) {
            neighbors[e.source].push(e.target);
            neighbors[e.target].push(e.source);
        }
    });

    const labels = {};
    ids.forEach((id, i) => (labels[id] = i));

    const MAX_ITERATIONS = 15;
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let changed = false;
        const order = [...ids].sort(() => Math.random() - 0.5);

        order.forEach((id) => {
            const neigh = neighbors[id];
            if (neigh.length === 0) return;

            const counts = {};
            neigh.forEach((n) => {
                const l = labels[n];
                counts[l] = (counts[l] || 0) + 1;
            });

            let bestLabel = labels[id];
            let bestCount = -1;
            Object.entries(counts).forEach(([l, c]) => {
                const labelNum = Number(l);
                if (c > bestCount || (c === bestCount && labelNum < bestLabel)) {
                    bestCount = c;
                    bestLabel = labelNum;
                }
            });

            if (bestLabel !== labels[id]) {
                labels[id] = bestLabel;
                changed = true;
            }
        });

        if (!changed) break;
    }

    // Remap raw labels to sequential 0..k-1 indices, ordered largest-first
    // so cluster colors/legend stay stable and readable.
    const sizeByLabel = {};
    Object.values(labels).forEach((l) => (sizeByLabel[l] = (sizeByLabel[l] || 0) + 1));
    const sortedLabels = Object.keys(sizeByLabel)
        .map(Number)
        .sort((a, b) => sizeByLabel[b] - sizeByLabel[a]);
    const remap = {};
    sortedLabels.forEach((l, idx) => (remap[l] = idx));

    const communityById = {};
    ids.forEach((id) => (communityById[id] = remap[labels[id]]));
    return communityById;
}

// A palette deliberately distinct from ENTITY_TYPE_COLORS below, so a
// cluster ring never gets visually confused with the entity-type fill color.
export const COMMUNITY_COLORS = [
    "#f43f5e", "#3b82f6", "#eab308", "#22c55e", "#a855f7",
    "#06b6d4", "#f97316", "#ec4899", "#14b8a6", "#84cc16",
];

export const ENTITY_TYPE_COLORS = {
    Person: "#fb923c",
    Organization: "#a78bfa",
    Technology: "#60a5fa",
    Concept: "#34d399",
    Algorithm: "#f472b6",
    "Programming Language": "#22d3ee",
    Database: "#fbbf24",
    Framework: "#818cf8",
    Method: "#2dd4bf",
    Product: "#f87171",
    Location: "#a3e635",
    Dataset: "#c084fc",
    Model: "#38bdf8",
    Other: "#94a3b8",
};