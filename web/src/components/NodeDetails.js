import React from 'react';
import './NodeDetails.css';

function NodeDetails({ node, onClose }) {
  if (!node) return null;

  const formatCode = (info) => {
    if (!info || info === 'none') return null;
    // Split by newlines for method lists or code
    return info.split('\n').filter(line => line.trim());
  };

  const codeLines = formatCode(node.info);

  return (
    <div className="node-details">
      <div className="node-header">
        <div className="node-title">
          <span className={`node-badge ${node.category}`}>
            {node.category}
          </span>
          <h3>{node.name}</h3>
        </div>
        <button className="close-btn" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="node-body">
        <div className="detail-row">
          <span className="label">File:</span>
          <span className="value">{node.file}</span>
        </div>

        <div className="detail-row">
          <span className="label">Lines:</span>
          <span className="value">
            {Array.isArray(node.line)
              ? `${node.line[0]} - ${node.line[1]}`
              : node.line}
          </span>
        </div>

        <div className="detail-row">
          <span className="label">Type:</span>
          <span className="value">{node.kind === 'def' ? 'Definition' : 'Reference'}</span>
        </div>

        {codeLines && codeLines.length > 0 && (
          <div className="code-section">
            <span className="label">
              {node.category === 'class' ? 'Methods:' : 'Code:'}
            </span>
            <pre className="code-block">
              {node.category === 'class'
                ? codeLines.map((line, i) => (
                    <div key={i} className="method-item">{line}</div>
                  ))
                : codeLines.slice(0, 20).join('\n')
              }
              {codeLines.length > 20 && (
                <div className="more-indicator">... and {codeLines.length - 20} more lines</div>
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default NodeDetails;
