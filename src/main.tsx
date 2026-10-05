import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// The simulator loads on its own, so the landing page's 3D scenes never
// slow it down and it never slows them.
const RaftLab = lazy(() => import('./lab/RaftLab.tsx'));

/** Show the simulator at #/raft and the landing page everywhere else. */
function Root() {
  const [hash, setHash] = useState(() => location.hash);

  useEffect(() => {
    const onChange = () => {
      setHash(location.hash);
      if (location.hash.startsWith('#/')) window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  if (hash.startsWith('#/raft')) {
    return (
      <Suspense fallback={null}>
        <RaftLab />
      </Suspense>
    );
  }
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
