import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T = any> {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  /** Provide to make the column sortable (click the header to toggle asc/desc). */
  sortValue?: (row: T) => string | number;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

/**
 * The shared admin table: client-side per-column sorting on any column that
 * declares a sortValue. Each tab picks its own defaultSort.
 */
export function Table<T = any>({
  rows,
  columns,
  defaultSort,
  rowKey,
}: {
  rows: T[];
  columns: Column<T>[];
  defaultSort?: SortState;
  rowKey?: (row: T) => string;
}) {
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
  }, [rows, sort, columns]);

  const toggle = (c: Column<T>) => {
    if (!c.sortValue) return;
    setSort((s) =>
      s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' },
    );
  };

  return (
    <div className="card overflow-x-auto p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-white/40">
            {columns.map((c) => (
              <th key={c.key} className="pb-2 font-medium">
                {c.sortValue ? (
                  <button
                    onClick={() => toggle(c)}
                    className={`inline-flex items-center gap-1 hover:text-white/80 ${sort?.key === c.key ? 'text-white/80' : ''}`}
                  >
                    {c.label}
                    {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r: any, i) => (
            <tr key={rowKey ? rowKey(r) : r.id ?? i} className="border-t border-white/5">
              {columns.map((c) => (
                <td key={c.key} className="py-2 pr-3">{c.render(r)}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-4 text-center text-white/40">—</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
