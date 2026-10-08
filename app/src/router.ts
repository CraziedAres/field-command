import { useEffect, useState } from 'preact/hooks';

/** Minimal path routing: returns the current path and a navigate function. */
export function useRoute(): [string, (to: string) => void] {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  return [path, (to: string) => {
    history.pushState(null, '', to);
    setPath(location.pathname);
  }];
}
