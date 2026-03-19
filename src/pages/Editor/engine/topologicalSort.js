/**
 * Kahn's algorithm for topological sort.
 * Returns { sorted, hasCycle }.
 * sorted: array of node IDs in execution order.
 */
export default function topologicalSort(nodes, edges) {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map();
  const adjacency = new Map();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adjacency.get(edge.source).push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);
    for (const neighbor of adjacency.get(current) || []) {
      const newDeg = inDegree.get(neighbor) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  const hasCycle = sorted.length !== nodeIds.size;
  return { sorted, hasCycle };
}
