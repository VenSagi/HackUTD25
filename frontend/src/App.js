import './App.css';
import { useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');

const buildUrl = (path) => {
  if (!path.startsWith('/')) {
    return `${API_BASE}/${path}`;
  }
  return `${API_BASE}${path}`;
};

function App() {
  const [health, setHealth] = useState(null);
  const [memories, setMemories] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [selectedClusterId, setSelectedClusterId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadData = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, memoriesRes, clustersRes] = await Promise.all([
        fetch(buildUrl('/api/health'), { signal }),
        fetch(buildUrl('/api/memories'), { signal }),
        fetch(buildUrl('/api/clusters'), { signal }),
      ]);

      if (!healthRes.ok) throw new Error('Failed to fetch health status');
      if (!memoriesRes.ok) throw new Error('Failed to fetch memories');
      if (!clustersRes.ok) throw new Error('Failed to fetch clusters');

      const [healthJson, memoriesJson, clustersJson] = await Promise.all([
        healthRes.json(),
        memoriesRes.json(),
        clustersRes.json(),
      ]);

      setHealth(healthJson);
      setMemories(Array.isArray(memoriesJson) ? memoriesJson : []);
      setClusters(Array.isArray(clustersJson) ? clustersJson : []);
      setLastUpdated(new Date());
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Unexpected error loading data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const filteredMemories = useMemo(() => {
    if (selectedClusterId === 'all') {
      return memories;
    }

    const cluster = clusters.find((c) => c.id === selectedClusterId);
    if (!cluster) {
      return memories;
    }

    const ids = new Set(cluster.memoryIds || []);
    return memories.filter(
      (memory) =>
        ids.has(memory.id) ||
        memory.cluster === selectedClusterId ||
        memory.cluster === cluster.name
    );
  }, [clusters, memories, selectedClusterId]);

  const totalMemories = memories.length;
  const actionCounts = useMemo(() => {
    return filteredMemories.reduce(
      (acc, memory) => {
        const action = (memory.overrideAction || memory.action || 'keep').toLowerCase();
        acc[action] = (acc[action] || 0) + 1;
        return acc;
      },
      {}
    );
  }, [filteredMemories]);

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Memory Storage Dashboard</h1>
          <p>Live view of the backend data running on port 5000.</p>
        </div>
        <div className="app__header-actions">
          <button
            className="button"
              onClick={() => loadData()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          {lastUpdated && (
            <span className="app__timestamp">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      <main className="layout">
        <section className="panel panel--status">
          <h2>Server Status</h2>
          <div className="status-badge status-badge--healthy">
            {health?.status === 'ok' ? 'Healthy' : 'Unknown'}
          </div>
          {error && <div className="error">{error}</div>}
          <dl className="metrics">
            <div>
              <dt>Memories Loaded</dt>
              <dd>{totalMemories}</dd>
            </div>
            <div>
              <dt>Clusters Loaded</dt>
              <dd>{clusters.length}</dd>
            </div>
            {Object.entries(actionCounts).map(([action, count]) => (
              <div key={action}>
                <dt>{action.charAt(0).toUpperCase() + action.slice(1)}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel panel--clusters">
          <div className="panel__header">
            <h2>Clusters</h2>
            <span className="panel__count">{clusters.length}</span>
          </div>
          <div className="cluster-list">
            <button
              className={`cluster-item ${selectedClusterId === 'all' ? 'cluster-item--active' : ''}`}
              onClick={() => setSelectedClusterId('all')}
            >
              <span className="cluster-item__title">All memories</span>
              <span className="cluster-item__meta">{totalMemories}</span>
            </button>
            {clusters.map((cluster) => (
              <button
                key={cluster.id}
                className={`cluster-item ${
                  selectedClusterId === cluster.id ? 'cluster-item--active' : ''
                }`}
                onClick={() => setSelectedClusterId(cluster.id)}
              >
                <span className="cluster-item__title">{cluster.name}</span>
                <span className="cluster-item__meta">
                  {cluster.memoryIds?.length ?? 0} • {cluster.action || 'keep'}
                </span>
              </button>
            ))}
            {!clusters.length && (
              <p className="empty-state">
                No clusters found yet. Upload content through the API to see them here.
              </p>
            )}
          </div>
        </section>

        <section className="panel panel--memories">
          <div className="panel__header">
            <h2>Memories</h2>
            <span className="panel__count">{filteredMemories.length}</span>
          </div>
          {loading ? (
            <p className="empty-state">Loading memories…</p>
          ) : filteredMemories.length ? (
            <ul className="memory-list">
              {filteredMemories.map((memory) => {
                const action = (memory.overrideAction || memory.action || 'keep').toLowerCase();
                return (
                  <li key={memory.id} className="memory-card">
                    <header className="memory-card__header">
                      <div>
                        <h3>{memory.title || memory.summary || memory.id}</h3>
                        <span className="memory-card__sub">
                          {memory.clusterName || memory.cluster || 'Unclustered'}
                        </span>
                      </div>
                      <span className={`tag tag--${action}`}>
                        {memory.overrideAction ? `${memory.overrideAction} (override)` : memory.action || 'keep'}
                      </span>
                    </header>
                    {memory.content && (
                      <p className="memory-card__content">
                        {memory.content.length > 180
                          ? `${memory.content.slice(0, 180)}…`
                          : memory.content}
                      </p>
                    )}
                    <dl className="memory-card__meta">
                      {memory.type && (
                        <div>
                          <dt>Type</dt>
                          <dd>{memory.type}</dd>
                        </div>
                      )}
                      {memory.sentiment && (
                        <div>
                          <dt>Sentiment</dt>
                          <dd>{memory.sentiment}</dd>
                        </div>
                      )}
                      {memory.relevance1Month != null && (
                        <div>
                          <dt>1 Month Relevance</dt>
                          <dd>{Math.round(memory.relevance1Month * 100)}%</dd>
                        </div>
                      )}
                      {memory.relevance1Year != null && (
                        <div>
                          <dt>1 Year Relevance</dt>
                          <dd>{Math.round(memory.relevance1Year * 100)}%</dd>
                        </div>
                      )}
                      {memory.createdAt && (
                        <div>
                          <dt>Created</dt>
                          <dd>{new Date(memory.createdAt).toLocaleDateString()}</dd>
                        </div>
                      )}
                    </dl>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-state">
              No memories loaded yet. Use the upload API to create some, then refresh.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
