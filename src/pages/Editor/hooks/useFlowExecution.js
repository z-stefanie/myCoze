import { useState, useCallback, useRef } from 'react';
import FlowEngine from '../engine/FlowEngine';

const NODE_LABELS = { start: '开始', prompt: 'Prompt', llm: '大模型', output: '输出' };

export default function useFlowExecution(getNodes, getEdges, updateNodeStatus) {
  const [status, setStatus] = useState('idle');
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [nodeResults, setNodeResults] = useState({});
  const [logs, setLogs] = useState([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pausedNodeId, setPausedNodeId] = useState(null);

  const engineRef = useRef(null);
  const resumeRef = useRef(null);
  const timerRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const run = useCallback(async () => {
    const nodes = getNodes();
    const edges = getEdges();

    setStatus('running');
    setNodeStatuses({});
    setNodeResults({});
    setLogs([]);
    setElapsedMs(0);
    setPausedNodeId(null);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    nodes.forEach((n) => updateNodeStatus(n.id, 'idle'));

    const engine = new FlowEngine(nodes, edges, {
      onNodeStart(nodeId) {
        const node = nodeMap.get(nodeId);
        setNodeStatuses((prev) => ({ ...prev, [nodeId]: 'running' }));
        updateNodeStatus(nodeId, 'running');
        setNodeResults((prev) => ({
          ...prev,
          [nodeId]: { label: NODE_LABELS[node?.type] || nodeId },
        }));
      },
      onNodeComplete(nodeId, { input, output, duration }) {
        const node = nodeMap.get(nodeId);
        setNodeStatuses((prev) => ({ ...prev, [nodeId]: 'success' }));
        updateNodeStatus(nodeId, 'success');
        setNodeResults((prev) => ({
          ...prev,
          [nodeId]: {
            label: NODE_LABELS[node?.type] || nodeId,
            input: input.upstreamOutputs,
            output,
            duration,
          },
        }));
      },
      onNodeError(nodeId, error) {
        const node = nodeMap.get(nodeId);
        setNodeStatuses((prev) => ({ ...prev, [nodeId]: 'error' }));
        updateNodeStatus(nodeId, 'error');
        setNodeResults((prev) => ({
          ...prev,
          [nodeId]: {
            ...prev[nodeId],
            label: NODE_LABELS[node?.type] || nodeId,
            error: error.message,
          },
        }));
      },
      onLog(message) {
        setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
      },
      onBreakpoint(nodeId, resume) {
        setPausedNodeId(nodeId);
        setStatus('paused');
        resumeRef.current = resume;
      },
    });

    engineRef.current = engine;

    try {
      await engine.run();
      if (!engine.aborted) {
        setStatus('success');
        const finalOutput = engine.nodeOutputs;
        const outputNodeId = nodes.find((n) => n.type === 'output')?.id;
        if (outputNodeId && finalOutput[outputNodeId] !== undefined) {
          updateNodeStatus(outputNodeId, 'success');
          const result = finalOutput[outputNodeId];
          nodes.forEach((n) => {
            if (n.type === 'output') {
              updateNodeStatus(n.id, 'success', {
                outputResult: typeof result === 'string' ? result : JSON.stringify(result),
              });
            }
          });
        }
      }
    } catch {
      setStatus('error');
    } finally {
      clearTimer();
      setElapsedMs(Date.now() - startTime);
      engineRef.current = null;
    }
  }, [getNodes, getEdges, updateNodeStatus]);

  const stop = useCallback(() => {
    engineRef.current?.abort();
    clearTimer();
    setStatus('idle');
    setPausedNodeId(null);
  }, []);

  const resume = useCallback(() => {
    setPausedNodeId(null);
    setStatus('running');
    resumeRef.current?.();
  }, []);

  return {
    run,
    stop,
    executionState: {
      status,
      nodeStatuses,
      nodeResults,
      logs,
      elapsedMs,
      pausedNodeId,
      onResume: pausedNodeId ? resume : null,
    },
  };
}
