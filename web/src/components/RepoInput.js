import React, { useState } from 'react';
import './RepoInput.css';

function RepoInput({ onSubmit, loading }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim() && !loading) {
      onSubmit(url.trim());
    }
  };

  const handleExampleClick = (exampleUrl) => {
    setUrl(exampleUrl);
  };

  return (
    <div className="repo-input">
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repository"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !url.trim()}>
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </form>

      <div className="examples">
        <span>Try:</span>
        <button onClick={() => handleExampleClick('https://github.com/pallets/flask')}>
          Flask
        </button>
        <button onClick={() => handleExampleClick('https://github.com/psf/requests')}>
          Requests
        </button>
        <button onClick={() => handleExampleClick('https://github.com/tiangolo/fastapi')}>
          FastAPI
        </button>
      </div>
    </div>
  );
}

export default RepoInput;
