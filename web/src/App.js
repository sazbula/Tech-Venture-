import React, { useState, useCallback } from 'react';
import RepoInput from './components/RepoInput';
import GraphVisualization from './components/GraphVisualization';
import NodeDetails from './components/NodeDetails';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || '';
const LARGE_REPO_THRESHOLD = 100; // Auto-enable files_only above this

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [repoName, setRepoName] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [stats, setStats] = useState(null);
  const [filesOnly, setFilesOnly] = useState(false);

  const fetchGraphData = useCallback(async (name, useFilesOnly) => {
    const graphRes = await fetch(`${API_BASE}/graph/${name}/vis?files_only=${useFilesOnly}`);
    if (!graphRes.ok) {
      throw new Error('Failed to fetch graph data');
    }
    return await graphRes.json();
  }, []);

  const analyzeRepo = useCallback(async (url) => {
    setLoading(true);
    setError(null);
    setGraphData(null);
    setSelectedNode(null);

    try {
      // Step 1: Analyze the repository
      const analyzeRes = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, force: false }),
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.detail || 'Analysis failed');
      }

      const analyzeData = await analyzeRes.json();
      setRepoName(analyzeData.repo_name);
      setStats({
        nodes: analyzeData.node_count,
        edges: analyzeData.edge_count,
      });

      // Auto-enable files_only for large repos
      const isLargeRepo = analyzeData.node_count > LARGE_REPO_THRESHOLD;
      setFilesOnly(isLargeRepo);

      // Step 2: Fetch visualization data
      const graphJson = await fetchGraphData(analyzeData.repo_name, isLargeRepo);
      setGraphData(graphJson);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchGraphData]);

  const toggleFilesOnly = useCallback(async () => {
    if (!repoName) return;

    const newFilesOnly = !filesOnly;
    setFilesOnly(newFilesOnly);

    try {
      const graphJson = await fetchGraphData(repoName, newFilesOnly);
      setGraphData(graphJson);
    } catch (err) {
      setError(err.message);
    }
  }, [repoName, filesOnly, fetchGraphData]);

  const handleNodeClick = useCallback(async (node) => {
    if (!repoName) return;

    try {
      const res = await fetch(`${API_BASE}/graph/${repoName}/node/${encodeURIComponent(node.id)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedNode(data);
      }
    } catch (err) {
      console.error('Failed to fetch node details:', err);
    }
  }, [repoName]);

  return (
    <div className="app">
      <header className="header">
        <h1>Contextify</h1>
        <p>Repository Structure Visualization</p>
      </header>

      <main className="main">
        <RepoInput onSubmit={analyzeRepo} loading={loading} />

        {error && (
          <div className="error">
            {error}
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Analyzing repository...</p>
            <p className="loading-hint">This may take a moment for large repositories</p>
          </div>
        )}

        {graphData && (
          <div className="content">
            <div className="stats">
              <h2>{repoName}</h2>
              <div className="stat-items">
                <span>{stats?.nodes || 0} total nodes</span>
                <span>{stats?.edges || 0} edges</span>
                <span>{graphData.nodes?.length || 0} showing</span>
              </div>
              <div className="view-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={filesOnly}
                    onChange={toggleFilesOnly}
                  />
                  Files only (better for large repos)
                </label>
              </div>
            </div>

            <div className="visualization-container">
              <GraphVisualization
                data={graphData}
                onNodeClick={handleNodeClick}
              />

              {selectedNode && (
                <NodeDetails
                  node={selectedNode}
                  onClose={() => setSelectedNode(null)}
                />
              )}
            </div>
          </div>
        )}

        {!loading && !graphData && !error && (
          <div className="empty-state">
            <p>Enter a GitHub repository URL to visualize its structure</p>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Contextify</p>
      </footer>
    </div>
  );
}

export default App;
