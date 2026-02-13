import React, { useContext, useEffect, useMemo, useState } from 'react';

type PaginationContextValue = {
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  pageSize: number;
  totalItems: number;
  setTotalItems: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
};

const PaginationContext = React.createContext<PaginationContextValue | null>(null);

export function PaginationProvider({
  children,
  pageSize = 25,
}: {
  children: React.ReactNode;
  pageSize?: number;
}) {
  const [page, setPage] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil((totalItems || 0) / pageSize));
  }, [totalItems, pageSize]);

  // Clamp page when total changes
  useEffect(() => {
    setPage((p) => {
      const next = Math.min(Math.max(1, p), totalPages);
      return next;
    });
  }, [totalPages]);

  const value: PaginationContextValue = useMemo(
    () => ({ page, setPage, pageSize, totalItems, setTotalItems, totalPages }),
    [page, pageSize, totalItems, totalPages]
  );

  return <PaginationContext.Provider value={value}>{children}</PaginationContext.Provider>;
}

export function usePagination() {
  const ctx = useContext(PaginationContext);
  if (!ctx) throw new Error('usePagination must be used within PaginationProvider');
  return ctx;
}
