import React from 'react';

const Pagination: React.FC = () => {
  return (
    <div className="flex items-center gap-2">
      <button className="px-2 py-1 rounded bg-zinc-700 text-xs">Prev</button>
      <span className="text-xs">1</span>
      <button className="px-2 py-1 rounded bg-zinc-700 text-xs">Next</button>
      <span className="ml-2 text-xs text-zinc-400">Showing page 1/4</span>
    </div>
  );
};

export default Pagination;
