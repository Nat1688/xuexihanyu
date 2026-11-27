import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';

export type Resource<T> =
  { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: T };

/** Consumers key by resource identity. Ignore results after navigation/unmount. */
export function useResource<T>(load: () => Promise<T>, onExpired: () => void) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<Resource<T>>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void load().then(
      (data) => {
        if (active) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) onExpired();
        else setState({ status: 'error', error });
      },
    );
    return () => {
      active = false;
    };
  }, [load, onExpired, revision]);
  return { state, refresh: () => setRevision((value) => value + 1) };
}
