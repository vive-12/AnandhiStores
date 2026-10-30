// hooks/useQRCodes.ts — Live subscription & state for QR codes
import { useState, useEffect, useMemo, useCallback } from 'react';
import { listenQRCodes } from '../services/qr';
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

  const [revision, setRevision] = useState(0);
  useEffect(() => {
    // Attempt auto-seed if collection is empty
    // Payee details must be explicitly configured by admin.

    const unsub = listenQRCodes(
      list => {
        setError(null);
        setQrCodes(list);
        setLoading(false);
      },
      err => {
        setError(err);
        setLoading(false);
      },
    );

    return unsub;
  }, [revision]);

  const defaultQR = useMemo(() => {
    if (qrCodes.length === 0) return null;
    return qrCodes.find(q => q.isDefault) || qrCodes[0];
  }, [qrCodes]);

  const refresh = useCallback(async () => { setLoading(true); setError(null); setRevision(n => n + 1); }, []);

  return { qrCodes, defaultQR, loading, error, refresh };
}
