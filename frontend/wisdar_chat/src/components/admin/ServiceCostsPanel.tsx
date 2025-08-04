// src/components/admin/ServiceCostsPanel.tsx

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RefreshCw, Coins, ArrowUpDown } from 'lucide-react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
} from "@tanstack/react-table";

// --- NEW: Updated interface to match the unified ServiceCost model ---
interface UnifiedServiceCost {
    id: number;
    service_key: string;
    display_name: string;
    description: string | null;
    cost: number;
    unit: string;
}

const ServiceCostsPanel: React.FC = () => {
    const { t } = useTranslation();
    const [costs, setCosts] = useState<UnifiedServiceCost[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [editingCosts, setEditingCosts] = useState<{ [key: number]: string }>({});
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

    const fetchCosts = async () => {
        setIsLoading(true);
        try {
            const response = await authFetch('/admin/service-costs');
            if (!response.ok) throw new Error('Failed to fetch service costs');
            const data: UnifiedServiceCost[] = await response.json();
            setCosts(data);
        } catch (error) {
            console.error("Error fetching service costs:", error);
            toast.error(t('admin.fetchCostsError', 'Failed to load service costs.'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCosts();
    }, []);

    const handleCostChange = (id: number, value: string) => {
        setEditingCosts(prev => ({ ...prev, [id]: value }));
    };

    const handleUpdateCost = async (id: number) => {
        const newCost = editingCosts[id];
        if (newCost === undefined || isNaN(parseFloat(newCost)) || parseFloat(newCost) < 0) {
            toast.warning(t('admin.invalidCostWarning', 'A valid, non-negative number is required for the cost.'));
            return;
        }

        try {
            const response = await authFetch(`/admin/service-costs/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ cost: parseFloat(newCost) }),
            });
            if (!response.ok) throw new Error((await response.json()).message || 'Failed to update cost');
            
            toast.success(t('admin.updateCostSuccess', 'Cost updated successfully!'));
            setEditingCosts(prev => {
                const newEditingCosts = { ...prev };
                delete newEditingCosts[id];
                return newEditingCosts;
            });
            fetchCosts(); 
        } catch (error) {
            toast.error(t('admin.updateCostError', 'Failed to update cost.'), {
                description: (error as Error).message,
            });
        }
    };

    // --- NEW: Updated column definitions for the unified table ---
    const columns: ColumnDef<UnifiedServiceCost>[] = [
        {
            accessorKey: "display_name",
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                    Service Name
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => (
                <div className="font-medium">
                    <div>{row.original.display_name}</div>
                    <div className="text-xs text-muted-foreground">{row.original.description}</div>
                </div>
            ),
        },
        {
            accessorKey: "service_key",
            header: "Service Key",
            cell: ({ row }) => <code className="text-sm">{row.original.service_key}</code>
        },
        {
            accessorKey: "unit",
            header: "Unit",
        },
        {
            accessorKey: "cost",
            header: () => <div className="text-left">Cost in Credits</div>,
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                    <Input
                        type="number"
                        value={editingCosts[row.original.id] ?? row.original.cost}
                        onChange={(e) => handleCostChange(row.original.id, e.target.value)}
                        className="h-9 w-32"
                        step="0.0001"
                        min="0"
                    />
                </div>
            ),
        },
        {
            id: "actions",
            cell: ({ row }) => (
                <div className="text-right">
                    <Button 
                        size="sm"
                        onClick={() => handleUpdateCost(row.original.id)}
                        disabled={editingCosts[row.original.id] === undefined}
                    >
                        {t('admin.save', 'Save')}
                    </Button>
                </div>
            ),
        },
    ];

    const table = useReactTable({
        data: costs,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        state: { sorting, columnFilters },
    });
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('admin.manageServiceCosts', 'Manage Service Costs')}</CardTitle>
                <CardDescription>
                    Configure the credit cost for every billable action in the application, from internal tasks to all AI services.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between py-4">
                    <Input
                        placeholder={t('admin.filterServices', 'Filter services by name...')}
                        value={(table.getColumn("display_name")?.getFilterValue() as string) ?? ""}
                        onChange={(event) =>
                            table.getColumn("display_name")?.setFilterValue(event.target.value)
                        }
                        className="max-w-sm"
                    />
                    <Button variant="outline" size="sm" onClick={fetchCosts} disabled={isLoading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        {t('admin.refresh', 'Refresh')}
                    </Button>
                </div>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow key={row.id}>
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={columns.length} className="h-24 text-center">
                                        {isLoading ? t('loading', 'Loading...') : t('admin.noResults', 'No services found.')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="flex items-center justify-end space-x-2 py-4">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >
                      {t('admin.previous', 'Previous')}
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                    >
                      {t('admin.next', 'Next')}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default ServiceCostsPanel;