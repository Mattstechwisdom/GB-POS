import React from 'react';
import { usePagination } from '../lib/pagination';

const Pagination: React.FC = () => {
  const { page, setPage, pageSize, totalItems, totalPages } = usePagination();
  const start = totalItems > 0 ? (page - 1) * pageSize + 1 : 0;
  const end = totalItems > 0 ? Math.min(page * pageSize, totalItems) : 0;

  return (
    <div className="flex items-center gap-2">
      <button
        className="px-2 py-1 rounded bg-zinc-700 text-xs disabled:opacity-40"
        disabled={page <= 1}
        onClick={() => setPage((p) => Math.max(1, p - 1))}
      >Prev</button>
      <span className="text-xs">{page}</span>
      <button
        className="px-2 py-1 rounded bg-zinc-700 text-xs disabled:opacity-40"
        disabled={page >= totalPages}
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
      >Next</button>
      <span className="ml-2 text-xs text-zinc-400">
        {totalItems === 0 ? 'Showing 0' : `Showing ${start}-${end} of ${totalItems}`} • Page {page}/{totalPages}
      </span>
    </div>
  );
};

export default Pagination;
