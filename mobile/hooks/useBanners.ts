// hooks/useBanners.ts — Live promotional banners hook
import { useState, useEffect } from 'react';
import { listenBanners, AppBanner } from '../services/banners';

export type { AppBanner };

export function useBanners() {
  const [banners, setBanners] = useState<AppBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsub = listenBanners(
      data => {
        setBanners(data);
        setLoading(false);
      },
      err => {
        setError(err);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { banners, loading, error };
}
