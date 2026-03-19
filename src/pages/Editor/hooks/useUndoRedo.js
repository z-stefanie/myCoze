import { useCallback, useRef, useState } from 'react';

const MAX_HISTORY = 50;

export default function useUndoRedo(initialNodes = [], initialEdges = []) {
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const skipNextRef = useRef(false);

  const takeSnapshot = useCallback((nodes, edges) => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    setPast((prev) => {
      const next = [...prev, { nodes: structuredClone(nodes), edges: structuredClone(edges) }];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setFuture([]);
  }, []);

  const undo = useCallback((currentNodes, currentEdges, setNodes, setEdges) => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [
      ...prev,
      { nodes: structuredClone(currentNodes), edges: structuredClone(currentEdges) },
    ]);
    skipNextRef.current = true;
    setNodes(previous.nodes);
    setEdges(previous.edges);
  }, [past]);

  const redo = useCallback((currentNodes, currentEdges, setNodes, setEdges) => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setFuture((prev) => prev.slice(0, -1));
    setPast((prev) => [
      ...prev,
      { nodes: structuredClone(currentNodes), edges: structuredClone(currentEdges) },
    ]);
    skipNextRef.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [future]);

  return {
    takeSnapshot,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
