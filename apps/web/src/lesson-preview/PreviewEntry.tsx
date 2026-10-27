import { useEffect, useState } from 'react';
import { previewApi } from './client';

/** No optimistic entry or persistent availability cache. Errors fail closed. */
export function PreviewEntry({ onOpen }: { onOpen: () => void }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    void previewApi
      .availability()
      .then((value) => {
        if (active) setAvailable(value.available === true);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return available ? (
    <button type="button" className="clp-button" onClick={onOpen}>
      Lesson 01 · PREVIEW
    </button>
  ) : null;
}
