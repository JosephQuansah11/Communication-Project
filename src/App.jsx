import { useEffect, useState } from 'react';
import Home from './pages/Home.jsx';
import Editor from './pages/Editor.jsx';
import Presenter from './pages/Presenter.jsx';
import LiveAudience from './pages/LiveAudience.jsx';

function resolve(pathname) {
  const live = pathname.match(/^\/live\/([A-Za-z0-9]+)\/?$/);
  if (live) return { page: 'live', code: live[1] };
  const present = pathname.match(/^\/present\/([A-Za-z0-9_-]+)\/?$/);
  if (present) return { page: 'present', deckId: present[1] };
  const edit = pathname.match(/^\/edit\/([A-Za-z0-9_-]+)\/?$/);
  if (edit) return { page: 'edit', deckId: edit[1] };
  return { page: 'home' };
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (next) => {
    if (next === window.location.pathname) return;
    window.history.pushState({}, '', next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const route = resolve(path);

  if (route.page === 'live') return <LiveAudience code={route.code} />;
  if (route.page === 'present') return <Presenter deckId={route.deckId} navigate={navigate} />;
  if (route.page === 'edit') return <Editor deckId={route.deckId} navigate={navigate} />;
  return <Home navigate={navigate} />;
}
