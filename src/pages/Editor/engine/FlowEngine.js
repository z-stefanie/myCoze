import topologicalSort from './topologicalSort';
import validateFlow from './validator';
import { callLLM } from './llmService';

/**
 * Interpolate {{varName}} placeholders in a template string
 * using the provided variables map.
 */
function interpolate(template, variables) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
  });
}

/**
 * FlowEngine — executes a flow graph sequentially.
 *
 * Callbacks:
 *   onNodeStart(nodeId)
 *   onNodeComplete(nodeId, { input, output, duration })
 *   onNodeError(nodeId, error)
 *   onLog(message)
 *   onBreakpoint(nodeId, resume: () => void)
 */
export default class FlowEngine {
  constructor(nodes, edges, callbacks = {}) {
    this.nodes = nodes;
    this.edges = edges;
    this.cb = callbacks;
    this.nodeOutputs = {};
    this.variables = {};
    this.aborted = false;
    this._breakpointResolve = null;
  }

  abort() {
    this.aborted = true;
    if (this._breakpointResolve) {
      this._breakpointResolve();
      this._breakpointResolve = null;
    }
  }

  async run() {
    this.aborted = false;
    this.nodeOutputs = {};
    this.variables = {};

    const validation = validateFlow(this.nodes, this.edges);
    if (!validation.valid) {
      const msg = validation.errors.map((e) => e.message).join('\n');
      this.cb.onLog?.(`❌ 验证失败:\n${msg}`);
      throw new Error(msg);
    }

    const { sorted } = topologicalSort(this.nodes, this.edges);
    const nodeMap = new Map(this.nodes.map((n) => [n.id, n]));

    this.cb.onLog?.('🚀 开始执行流程...');

    for (const nodeId of sorted) {
      if (this.aborted) {
        this.cb.onLog?.('⛔ 流程已被终止');
        return;
      }

      const node = nodeMap.get(nodeId);
      if (!node) continue;

      if (node.data.breakpoint && node.type !== 'start') {
        this.cb.onLog?.(`⏸️ 命中断点: ${getLabel(node)}`);
        await new Promise((resolve) => {
          this._breakpointResolve = resolve;
          this.cb.onBreakpoint?.(nodeId, () => {
            this._breakpointResolve = null;
            resolve();
          });
        });
        if (this.aborted) return;
      }

      this.cb.onNodeStart?.(nodeId);
      const startTime = Date.now();

      try {
        const input = this.resolveInput(node);
        const output = await this.executeNode(node, input);
        const duration = Date.now() - startTime;

        this.nodeOutputs[nodeId] = output;
        this.cb.onNodeComplete?.(nodeId, { input, output, duration });
        this.cb.onLog?.(`✅ ${getLabel(node)} 完成 (${duration}ms)`);
      } catch (err) {
        const duration = Date.now() - startTime;
        this.cb.onNodeError?.(nodeId, err);
        this.cb.onLog?.(`❌ ${getLabel(node)} 失败: ${err.message} (${duration}ms)`);
        throw err;
      }
    }

    this.cb.onLog?.('🎉 流程执行完成');
  }

  /**
   * Gather input for a node from upstream outputs.
   */
  resolveInput(node) {
    const upstreamEdges = this.edges.filter((e) => e.target === node.id);
    const inputs = {};
    for (const edge of upstreamEdges) {
      const upOutput = this.nodeOutputs[edge.source];
      if (upOutput !== undefined) {
        inputs[edge.source] = upOutput;
      }
    }
    return { upstreamOutputs: inputs, variables: { ...this.variables } };
  }

  /**
   * Execute a single node based on its type.
   */
  async executeNode(node, input) {
    switch (node.type) {
      case 'start':
        return this.executeStart(node);
      case 'prompt':
        return this.executePrompt(node, input);
      case 'llm':
        return this.executeLLM(node, input);
      case 'output':
        return this.executeOutput(node, input);
      default:
        throw new Error(`未知节点类型: ${node.type}`);
    }
  }

  executeStart(node) {
    const vars = node.data.variables || [];
    for (const v of vars) {
      if (v.key) this.variables[v.key] = v.value || '';
    }
    return { variables: { ...this.variables } };
  }

  executePrompt(node, input) {
    const allVars = { ...this.variables };
    for (const [, val] of Object.entries(input.upstreamOutputs)) {
      if (typeof val === 'string') allVars.upstream = val;
      if (typeof val === 'object' && val.variables) Object.assign(allVars, val.variables);
      if (typeof val === 'object' && val.result) allVars.upstream = val.result;
    }

    const systemPrompt = interpolate(node.data.systemPrompt, allVars);
    const userPrompt = interpolate(node.data.userPrompt, allVars);

    return { systemPrompt, userPrompt };
  }

  async executeLLM(node, input) {
    let systemPrompt = '';
    let userPrompt = '';

    for (const [, val] of Object.entries(input.upstreamOutputs)) {
      if (val && typeof val === 'object') {
        if (val.systemPrompt) systemPrompt = val.systemPrompt;
        if (val.userPrompt) userPrompt = val.userPrompt;
      }
    }

    const result = await callLLM(systemPrompt, userPrompt, {
      model: node.data.model,
      apiKey: node.data.apiKey,
      temperature: node.data.temperature,
      maxTokens: node.data.maxTokens,
    });

    return { result };
  }

  executeOutput(node, input) {
    let finalResult = '';
    for (const [, val] of Object.entries(input.upstreamOutputs)) {
      if (typeof val === 'string') finalResult = val;
      if (val && val.result) finalResult = val.result;
    }
    return finalResult;
  }
}

function getLabel(node) {
  const labels = { start: '开始', prompt: 'Prompt', llm: '大模型', output: '输出' };
  return labels[node.type] || node.type;
}
