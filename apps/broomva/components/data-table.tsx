"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CircleDotIcon,
  ColumnsIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react"
import { z } from "zod"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const sessionSchema = z.object({
  id: z.string(),
  status: z.enum(["active", "completed", "failed"]),
  created: z.string(),
  messages: z.number(),
  toolCalls: z.number(),
})

type SessionRow = z.infer<typeof sessionSchema>

// Placeholder data — will be wired to /api/agent/sessions later
const placeholderData: SessionRow[] = [
  {
    id: "sess-001",
    status: "active",
    created: "2026-03-20T14:23:00Z",
    messages: 12,
    toolCalls: 8,
  },
  {
    id: "sess-002",
    status: "completed",
    created: "2026-03-20T11:05:00Z",
    messages: 34,
    toolCalls: 22,
  },
  {
    id: "sess-003",
    status: "failed",
    created: "2026-03-19T22:10:00Z",
    messages: 7,
    toolCalls: 3,
  },
  {
    id: "sess-004",
    status: "completed",
    created: "2026-03-19T16:45:00Z",
    messages: 28,
    toolCalls: 15,
  },
  {
    id: "sess-005",
    status: "active",
    created: "2026-03-20T15:00:00Z",
    messages: 5,
    toolCalls: 2,
  },
  {
    id: "sess-006",
    status: "completed",
    created: "2026-03-18T09:30:00Z",
    messages: 45,
    toolCalls: 31,
  },
  {
    id: "sess-007",
    status: "completed",
    created: "2026-03-17T20:15:00Z",
    messages: 19,
    toolCalls: 11,
  },
  {
    id: "sess-008",
    status: "failed",
    created: "2026-03-17T14:50:00Z",
    messages: 3,
    toolCalls: 1,
  },
]

const columns: ColumnDef<SessionRow>[] = [
  {
    accessorKey: "id",
    header: "Session ID",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.original.id}</span>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status
      return (
        <Badge
          variant="outline"
          className="flex w-fit gap-1 px-1.5 text-muted-foreground [&_svg]:size-3"
        >
          {status === "completed" ? (
            <CheckCircle2Icon className="text-green-500 dark:text-green-400" />
          ) : status === "active" ? (
            <CircleDotIcon className="text-blue-500 dark:text-blue-400" />
          ) : (
            <XCircleIcon className="text-red-500 dark:text-red-400" />
          )}
          {status}
        </Badge>
      )
    },
  },
  {
    accessorKey: "created",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {new Date(row.original.created).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "messages",
    header: () => <div className="text-right">Messages</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{row.original.messages}</div>
    ),
  },
  {
    accessorKey: "toolCalls",
    header: () => <div className="text-right">Tool Calls</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{row.original.toolCalls}</div>
    ),
  },
]

export function DataTable({
  data: initialData,
}: {
  data?: SessionRow[]
}) {
  const data = initialData ?? placeholderData
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="flex w-full flex-col justify-start gap-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <h2 className="text-lg font-semibold">Agent Sessions</h2>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ColumnsIcon />
                <span className="hidden lg:inline">Customize Columns</span>
                <span className="lg:hidden">Columns</span>
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No sessions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
            {table.getFilteredRowModel().rows.length} session(s) total.
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                }}
              >
                <SelectTrigger className="w-20" id="rows-per-page">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <ChevronsLeftIcon />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <ChevronRightIcon />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to last page</span>
                <ChevronsRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
