import { Handle, Position } from '@xyflow/react';
import { Brain } from 'lucide-react';
import { useEditorContext } from '../EditorContext';
import styles from './nodeStyles.module.css';

export default function LLMNode({ id, data, selected }) {
  const status = data.status || 'idle';
  const model = data.model || 'GPT-4o';
  const { toggleBreakpoint } = useEditorContext();

  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''} ${styles[status] || ''}`}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          toggleBreakpoint(id);
        }}
        className={`${styles.breakpointBtn} ${data.breakpoint ? styles.active : ''}`}
        title="断点"
      />
      <Handle type="target" position={Position.Top} />
      <div className={styles.header}>
        <div className={`${styles.icon} ${styles.llmColor}`}>
          <Brain size={13} />
        </div>
        <div className={styles.title}>大模型调用</div>
        <div className={`${styles.status} ${styles[`status${status.charAt(0).toUpperCase() + status.slice(1)}`]}`} />
      </div>
      <div className={styles.body}>
        <span className={`${styles.tag} ${styles.tagPurple}`}>{model}</span>
        {data.temperature != null && (
          <span className={`${styles.tag} ${styles.tagBlue}`}>
            temp: {data.temperature}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
