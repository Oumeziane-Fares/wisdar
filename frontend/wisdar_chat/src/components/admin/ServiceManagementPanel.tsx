// src/components/admin/ServiceManagementPanel.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { authFetch } from '../../lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ProviderServiceAdmin, getServiceManagementColumns } from './ServiceManagementColumns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ServiceForm from './ServiceForm';
import { LucidePlusCircle } from 'lucide-react';

const ServiceManagementPanel: React.FC = () => {
  const [services, setServices] = useState<ProviderServiceAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
    // --- NEW: State to control the form dialog ---
  const [isFormOpen, setIsFormOpen] = useState(false);


  const fetchServices = async () => {
    setIsLoading(true);
    try {
      const response = await authFetch('/admin/provider-services');
      if (!response.ok) throw new Error('Failed to fetch services.');
      setServices(await response.json());
    } catch (error) {
      toast.error("Failed to load service configurations.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

    const handleToggleActive = async (serviceId: number, newStatus: boolean) => {
    try {
        const response = await authFetch(`/admin/provider-services/${serviceId}`, {
        method: 'PUT',
        // The fix is to send the newStatus directly
        body: JSON.stringify({ is_active: newStatus }),
        });
        if (!response.ok) throw new Error('Failed to update status.');
        toast.success("Service status updated.");
        fetchServices(); // Refresh data
    } catch (error) {
        toast.error("Failed to update service status.");
        fetchServices(); // Refresh even on error to revert the switch visually
    }
    };

  const handleDelete = async (serviceId: number, displayName: string) => {
    if (!window.confirm(`Are you sure you want to delete the service "${displayName}"? This cannot be undone.`)) return;
    try {
      const response = await authFetch(`/admin/provider-services/${serviceId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete service.');
      toast.success("Service deleted successfully.");
      fetchServices(); // Refresh data
    } catch (error) {
      toast.error("Failed to delete service.");
    }
  };

  const columns = useMemo(() => getServiceManagementColumns({
    onToggleActive: handleToggleActive,
    onDelete: handleDelete,
  }), []);

  const table = useReactTable({
    data: services,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleSave = () => {
    setIsFormOpen(false);
    fetchServices(); // Refresh the data after saving
  };

  return (
     <> 
        <Card>
        <CardHeader>
            <div className="flex justify-between items-center">
            <div>
                <CardTitle>Manage AI Services</CardTitle>
                <CardDescription>Configure all available AI models and services in the application.</CardDescription>
            </div>
                <Button onClick={() => setIsFormOpen(true)}>
                <LucidePlusCircle size={18} className="mr-2" />
                Add New Service
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border">
            <Table>
                <TableHeader>
                {table.getHeaderGroups().map(hg => (
                    <TableRow key={hg.id}>
                    {hg.headers.map(h => <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}
                    </TableRow>
                ))}
                </TableHeader>
                <TableBody>
                {table.getRowModel().rows?.length ? table.getRowModel().rows.map(row => (
                    <TableRow key={row.id}>
                    {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                    </TableRow>
                )) : (
                    <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                        {isLoading ? "Loading services..." : "No services found."}
                    </TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
            </div>
        </CardContent>
        </Card>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent>
            <DialogHeader>
                <DialogTitle>Add a New AI Service</DialogTitle>
                <DialogDescription>
                Define a new model or service variant and set its pricing.
                </DialogDescription>
            </DialogHeader>
            <ServiceForm 
                onSave={handleSave}
                onCancel={() => setIsFormOpen(false)}
            />
            </DialogContent>
        </Dialog>
    </>        
  );
};

export default ServiceManagementPanel;