// src/components/admin/TeamDashboard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../lib/api';
import { User } from '../../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LucideUsers, LucideArrowLeft, LucidePlusCircle, BarChart2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SubAccountForm from './SubAccountForm';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { flexRender, getCoreRowModel, getSortedRowModel, SortingState, useReactTable } from "@tanstack/react-table";
import { getTeamTableColumns } from './TeamTableColumns';


// --- Imports for the charting library ---
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
// --- ADD the new component to your imports ---
import UserReportDetail from './UserReportDetail';

// --- Type definition for the report data from the API ---
interface ReportData {
  total_spend: number;
  spend_by_user: { user_id: number; email: string; total: number }[];
  spend_by_service: { service: string; total: number }[];
}

const TeamDashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { t } = useTranslation();
  
  // --- State to manage the active tab ---
  const [activeTab, setActiveTab] = useState<'members' | 'reports'>('members');
  
  const [subAccounts, setSubAccounts] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [viewingUser, setViewingUser] = useState<{ id: number; email: string } | null>(null);

  // --- Data fetching functions ---
  const fetchSubAccounts = async () => {
    setIsLoading(true);
    try {
      const response = await authFetch('/team/sub_accounts');
      if (!response.ok) throw new Error('Failed to fetch sub-accounts');
      setSubAccounts(await response.json());
    } catch (error) { toast.error('Failed to load team members.'); } 
    finally { setIsLoading(false); }
  };
  
  const fetchReportData = async () => {
    setIsLoading(true);
    try {
      const response = await authFetch('/team/report/general');
      if (!response.ok) throw new Error('Failed to fetch report data.');
      setReportData(await response.json());
    } catch (error) { toast.error('Failed to load report data.'); } 
    finally { setIsLoading(false); }
  };

  // --- Effect to fetch data when the active tab changes ---
  useEffect(() => {
    if (activeTab === 'members') {
      fetchSubAccounts();
    } else if (activeTab === 'reports') {
      fetchReportData();
    }
  }, [activeTab]);

  // --- Handlers and table setup (unchanged) ---
  const handleEditUser = (user: User) => { setEditingUser(user); setIsFormOpen(true); };
  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm(t('team.deleteConfirm', 'Are you sure you want to delete this user?'))) return;
    try {
        await authFetch(`/team/sub_accounts/${userId}`, { method: 'DELETE' });
        toast.success(t('team.deleteSuccess', 'User deleted successfully.'));
        fetchSubAccounts();
    } catch (error) { toast.error(t('team.deleteError', 'Failed to delete user.')); }
  };
  const columns = useMemo(() => getTeamTableColumns({ onEdit: handleEditUser, onDelete: handleDeleteUser }), [t]);
  const table = useReactTable({ data: subAccounts, columns, getCoreRowModel: getCoreRowModel(), onSortingChange: setSorting, getSortedRowModel: getSortedRowModel(), state: { sorting } });
  const handleAddUserClick = () => { setEditingUser(null); setIsFormOpen(true); };
  const handleFormSave = () => { setIsFormOpen(false); fetchSubAccounts(); };

  const PIE_CHART_COLORS = ['#6B5CA5', '#8A7EB5', '#A9A0C5', '#C7C3D5', '#E6E5E5'];

  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 flex text-gray-900 dark:text-gray-100">
      {/* --- MODIFIED: Sidebar now has tab navigation --- */}
      <div className="w-64 h-full bg-white dark:bg-gray-800 border-r flex flex-col justify-between">
        <div>
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold flex items-center"><LucideUsers className="mr-2" /> Team Management</h2>
          </div>
          <nav className="p-2 space-y-1">
            <Button variant={activeTab === 'members' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setActiveTab('members')}>
              Manage Members
            </Button>
            <Button variant={activeTab === 'reports' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setActiveTab('reports')}>
              <BarChart2 className="mr-2 h-4 w-4" /> Reports
            </Button>
          </nav>
        </div>
        <div className="p-4 border-t">
          <Button onClick={onBack} variant="outline" className="w-full">
            <LucideArrowLeft size={18} className="mr-2" />
            <span>{t('backToChat', 'Back to Chat')}</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {/* --- This logic shows the member management table --- */}
        {activeTab === 'members' && (
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>{t('team.manageTitle', 'Manage Team Members')}</CardTitle>
                            <CardDescription>{t('team.manageDescription', 'Add, edit, or remove members of your team.')}</CardDescription>
                        </div>
                        <Button onClick={handleAddUserClick}>
                            <LucidePlusCircle size={18} className="mr-2" />
                            {t('team.addUser', 'Add User')}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
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
                                            {isLoading ? "Loading..." : "No members found."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        )}

        {/* --- This logic shows the reports --- */}
        {activeTab === 'reports' && (
            <div className="space-y-6">
                {/* --- This conditionally renders the detail view or the general report --- */}
                {viewingUser ? (
                    <UserReportDetail
                        userId={viewingUser.id}
                        userEmail={viewingUser.email}
                        onBack={() => setViewingUser(null)}
                    />
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>Team Usage Report</CardTitle>
                            <CardDescription>An overview of your team's credit consumption.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading && <p>Loading report...</p>}
                            {reportData && (
                                <div className="grid gap-6">
                                    <div className="grid md:grid-cols-3 gap-4">
                                        <Card>
                                            <CardHeader><CardTitle>Total Spend</CardTitle></CardHeader>
                                            <CardContent><p className="text-3xl font-bold">{Math.floor(reportData.total_spend).toLocaleString()} Credits</p></CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader><CardTitle>Active Members</CardTitle></CardHeader>
                                            <CardContent><p className="text-3xl font-bold">{reportData.spend_by_user.length}</p></CardContent>
                                        </Card>
                                    </div>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <Card>
                                            <CardHeader><CardTitle>Spend by User</CardTitle></CardHeader>
                                            <CardContent>
                                                <ResponsiveContainer width="100%" height={250}>
                                                    <BarChart data={reportData.spend_by_user} margin={{ top: 5, right: 20, left: -10, bottom: 50 }}>
                                                        <XAxis dataKey="email" fontSize={12} tickLine={false} axisLine={false} interval={0} angle={-35} textAnchor="end" />
                                                        <YAxis fontSize={12} />
                                                        <Tooltip />
                                                        <Bar dataKey="total" fill="#6B5CA5" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                                {/* --- This is the clickable user list for drill-down --- */}
                                                <div className="mt-4 text-sm font-medium border-t pt-2">
                                                    {reportData.spend_by_user.map(user => (
                                                        <div
                                                            key={user.user_id}
                                                            className="flex justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md cursor-pointer"
                                                            onClick={() => setViewingUser({ id: user.user_id, email: user.email })}
                                                        >
                                                            <span className="text-muted-foreground">{user.email}</span>
                                                            <span>{Math.floor(user.total).toLocaleString()} Credits</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader><CardTitle>Spend by Service</CardTitle></CardHeader>
                                            <CardContent>
                                                <ResponsiveContainer width="100%" height={300}>
                                                    <PieChart>
                                                        <Pie data={reportData.spend_by_service} dataKey="total" nameKey="service" cx="50%" cy="50%" outerRadius={100} label>
                                                          {reportData.spend_by_service.map((_entry, index) => (
                                                              <Cell key={`cell-${index}`} fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} />
                                                          ))}
                                                        </Pie>
                                                        <Tooltip formatter={(value: number) => `${Math.floor(value).toLocaleString()} Credits`} />
                                                        <Legend />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        )}
    </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[625px]">
            <DialogHeader>
                <DialogTitle>{editingUser ? 'Edit Team Member' : 'Add New Team Member'}</DialogTitle>
                <DialogDescription>
                    {editingUser ? 'Update the details and permissions.' : 'They will receive an email invitation to join.'}
                </DialogDescription>
            </DialogHeader>
            <SubAccountForm
                editingUser={editingUser}
                onSave={handleFormSave}
                onCancel={() => setIsFormOpen(false)}
            />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamDashboard;