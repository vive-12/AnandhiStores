// hooks/useQRCodes.ts — Live subscription & state for QR codes
import { useState, useEffect, useMemo, useCallback } from 'react';
import { listenQRCodes, seedDefaultQRCodeIfEmpty, getDefaultQRCode } from '../services/qr';
import type { QRCodeItem } from '../types';

interface UseQRCodesResult {
  qrCodes: QRCodeItem[];
  defaultQR: QRCodeItem | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useQRCodes(): UseQRCodesResult {
  const [qrCodes, setQrCodes] = useState<QRCodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Attempt auto-seed if collection is empty
    seedDefaultQRCodeIfEmpty().catch(() => {});

    const unsub = listenQRCodes(
      list => {
        setQrCodes(list);
        setLoading(false);
      },
      err => {
        setError(err);
        setLoading(false);
      },
    );

    return unsub;
  }, []);

  const defaultQR = useMemo(() => {
    if (qrCodes.length === 0) return null;
    return qrCodes.find(q => q.isDefault) || qrCodes[0];
  }, [qrCodes]);

  const refresh = useCallback(async () => {
    try {
      const def = await getDefaultQRCode();
      if (def) {
        setQrCodes(prev => {
          const exists = prev.some(q => q.id === def.id);
          return exists ? prev : [def, ...prev];
        });
      }
    } catch (_) {}
  }, []);

  return { qrCodes, defaultQR, loading, error, refresh };
}
