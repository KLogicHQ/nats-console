'use client';

import { useCallback, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { useTableStore, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/stores/table';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchColumn?: string;
  searchPlaceholder?: string;
  showPagination?: boolean;
  showSearch?: boolean;
  onRowClick?: (row: TData) => void;
  emptyMessage?: string;
}

// Wrapper component to handle Suspense for useSearchParams
export function DataTable<TData, TValue>(props: DataTableProps<TData, TValue>) {
  return (
    <Suspense fallback={<DataTableSkeleton />}>
      <DataTableInner {...props} />
    </Suspense>
  );
}

function DataTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="border rounded-lg">
        <div className="h-12 bg-muted/50 animate-pulse" />
        <div className="h-48 animate-pulse" />
      </div>
    </div>
  );
}

function DataTableInner<TData, TValue>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = 'Search...',
  showPagination = true,
  showSearch = true,
  onRowClick,
  emptyMessage = 'No results.',
}: DataTableProps<TData, TValue>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pageSize: storedPageSize, setPageSize: setStoredPageSize } = useTableStore();

  // Parse URL params
  const urlPage = parseInt(searchParams.get('page') || '1', 10) - 1;
  const urlSort = searchParams.get('sort') || '';
  const urlOrder = searchParams.get('order') as 'asc' | 'desc' | null;
  const urlSearch = searchParams.get('q') || '';
  const urlPageSize = parseInt(searchParams.get('size') || String(storedPageSize || DEFAULT_PAGE_SIZE), 10);

  // Parse sorting from URL
  const initialSorting: SortingState = urlSort
    ? [{ id: urlSort, desc: urlOrder === 'desc' }]
    : [];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: { pageIndex: urlPage, pageSize: urlPageSize },
      sorting: initialSorting,
      columnFilters: searchColumn && urlSearch ? [{ id: searchColumn, value: urlSearch }] : [],
    },
  });

  // Update URL params
  const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '' || value === '1' && key === 'page') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const newUrl = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  // Handle page change
  const handlePageChange = (pageIndex: number) => {
    table.setPageIndex(pageIndex);
    updateUrlParams({ page: String(pageIndex + 1) });
  };

  // Handle page size change
  const handlePageSizeChange = (newSize: number) => {
    setStoredPageSize(newSize);
    table.setPageSize(newSize);
    table.setPageIndex(0);
    updateUrlParams({
      size: newSize === DEFAULT_PAGE_SIZE ? null : String(newSize),
      page: null
    });
  };

  // Handle sorting change
  const handleSortingChange = (columnId: string) => {
    const currentSort = table.getState().sorting[0];
    let newSort: SortingState = [];
    let sortParam: string | null = null;
    let orderParam: string | null = null;

    if (!currentSort || currentSort.id !== columnId) {
      // First click: sort ascending
      newSort = [{ id: columnId, desc: false }];
      sortParam = columnId;
      orderParam = 'asc';
    } else if (!currentSort.desc) {
      // Second click: sort descending
      newSort = [{ id: columnId, desc: true }];
      sortParam = columnId;
      orderParam = 'desc';
    }
    // Third click: clear sorting (newSort stays empty)

    table.setSorting(newSort);
    updateUrlParams({ sort: sortParam, order: orderParam, page: null });
  };

  // Handle search change
  const handleSearchChange = (value: string) => {
    if (searchColumn) {
      table.getColumn(searchColumn)?.setFilterValue(value);
      table.setPageIndex(0);
      updateUrlParams({ q: value || null, page: null });
    }
  };

  const getSortIcon = (isSorted: false | 'asc' | 'desc') => {
    if (isSorted === 'asc') return <ArrowUp className="h-4 w-4" />;
    if (isSorted === 'desc') return <ArrowDown className="h-4 w-4" />;
    return <ArrowUpDown className="h-4 w-4 opacity-50" />;
  };

  return (
    <div className="space-y-4">
      {searchColumn && showSearch && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ''}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      )}

      <div className="border rounded-lg">
        <table className="w-full">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as { align?: 'left' | 'center' | 'right' } | undefined;
                  const align = meta?.align || 'left';
                  return (
                    <th
                      key={header.id}
                      className={`p-4 font-medium text-sm ${
                        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                      }`}
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={`inline-flex items-center gap-2 ${
                            header.column.getCanSort()
                              ? 'cursor-pointer select-none hover:text-foreground'
                              : ''
                          } ${align === 'right' ? 'flex-row-reverse' : ''}`}
                          onClick={() => header.column.getCanSort() && handleSortingChange(header.column.id)}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && getSortIcon(header.column.getIsSorted())}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={`border-t hover:bg-muted/30 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as { align?: 'left' | 'center' | 'right' } | undefined;
                    const align = meta?.align || 'left';
                    return (
                      <td
                        key={cell.id}
                        className={`p-4 ${
                          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                        }`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPagination && table.getFilteredRowModel().rows.length > 0 && (
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Showing {table.getRowModel().rows.length} of{' '}
              {table.getFilteredRowModel().rows.length} row(s).
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(table.getState().pagination.pageIndex - 1)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(table.getState().pagination.pageIndex + 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
