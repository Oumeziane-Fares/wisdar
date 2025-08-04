import React, { useState, useEffect, useMemo } from 'react';
import { authFetch } from '@/lib/api';
import { User } from '@/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { flexRender, getCoreRowModel, getSortedRowModel, SortingState, useReactTable } from "@tanstack/react-table";
import { getUserTableColumns } from './UserTableColumns';
import { LucideArrowLeft, LucidePlusCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import AddUserForm from './AddUserForm';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext'; // 1. Import useAuth

const UserManagementPanel: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingTeam, setViewingTeam] = useState<User | null>(null);
  const [subAccounts, setSubAccounts] = useState<User[]>([]);
  const [isSubAccountsLoading, setIsSubAccountsLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { user: currentUser } = useAuth(); // 2. Get the current user from the hook

  const fetchTopLevelUsers = async () => {
      setIsLoading(true);
      try {
        const response = await authFetch('/auth/users');
        if (!response.ok) throw new Error('Failed to fetch users.');
        setUsers(await response.json());
      } catch (error) {
        toast.error('Failed to load user list.');
      } finally {
        setIsLoading(false);
      }
    };

  useEffect(() => {
    fetchTopLevelUsers();
  }, []);

  useEffect(() => {
    if (viewingTeam) {
      const fetchSubAccounts = async () => {
        setIsSubAccountsLoading(true);
        try {
          const response = await authFetch(`/admin/team/${viewingTeam.id}/sub_accounts`);
          if (!response.ok) throw new Error('Failed to fetch team members.');
          setSubAccounts(await response.json());
        } catch (error) {
          toast.error(`Failed to load members for ${viewingTeam.full_name}.`);
        } finally {
          setIsSubAccountsLoading(false);
        }
      };
      fetchSubAccounts();
    }
  }, [viewingTeam]);

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      const response = await authFetch(`/admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update role.');
      }

      const updatedUser = await response.json();
      setUsers(prevUsers => 
        prevUsers.map(u => u.id === userId ? { ...u, role: updatedUser.role } : u)
      );
      toast.success("User role updated successfully.");
    } catch (error: any) {
      toast.error("Update Failed", { description: error.message });
    }
  };

  const handleFormSave = () => {
    setIsFormOpen(false);
    fetchTopLevelUsers();
  };

    const handleResendInvitation = async (userId: number) => {
    try {
      const response = await authFetch(`/admin/users/${userId}/resend-invitation`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'An unknown error occurred.');
      }
      toast.success(data.message);
    } catch (error: any) {
      toast.error("Failed to resend invitation", { description: error.message });
    }
  };

  const columns = useMemo(() => getUserTableColumns({
    onViewTeam: (user) => setViewingTeam(user),
    onRoleChange: handleRoleChange,
    onResendInvitation: handleResendInvitation, // Pass the new handler
  }, currentUser), [currentUser]);

  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
  });
  
  if (viewingTeam) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setViewingTeam(null)}>
              <LucideArrowLeft />
            </Button>
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Sub-accounts managed by {viewingTeam.full_name}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
           {isSubAccountsLoading ? <p>Loading members...</p> : (
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {subAccounts.map(user => (
                            <TableRow key={user.id}>
                                <TableCell>{user.full_name}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                    <Badge variant={user.is_active ? "default" : "destructive"} className={user.is_active ? "bg-green-500" : ""}>
                                        {user.is_active ? "Active" : "Pending"}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
           )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>List of all top-level administrators and team managers.</CardDescription>
            </div>
            <Button onClick={() => setIsFormOpen(true)}>
                <LucidePlusCircle size={18} className="mr-2" />
                Add New Account
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
                    {row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      {isLoading ? "Loading users..." : "No users found."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Account</DialogTitle>
            <DialogDescription>
              An invitation will be sent to the user's email to set up their account.
            </DialogDescription>
          </DialogHeader>
          <AddUserForm 
            onSave={handleFormSave}
            onCancel={() => setIsFormOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserManagementPanel;
