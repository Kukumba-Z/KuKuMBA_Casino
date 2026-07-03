import { useQueryClient } from '@tanstack/react-query';
import { apiError } from '../../../lib/api';
import { toast } from '../../../store/toast';

/**
 * The admin mutation wrapper every tab uses: run the call, invalidate the
 * given query keys, toast success/error. Keeps mutations one-liners.
 */
export function useAct(...keys: (string | readonly unknown[])[]) {
  const qc = useQueryClient();
  return async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      for (const k of keys) qc.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] });
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(apiError(e));
      return false;
    }
  };
}
