// src/components/admin/UserReportDetail.tsx

import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from 'sonner';
import { LucideArrowLeft } from 'lucide-react';

interface Transaction {
  id: number;
  user_email: string;
  service_name: string;
  model_name: string;
  cost_deducted: number;
  transaction_time: string;
}

interface TransactionResponse {
  transactions: Transaction[];
  total_pages: number;
  current_page: number;
  has_next: boolean;
  has_prev: boolean;
}

interface UserReportDetailProps {
  userId: number;
  userEmail: string;
  onBack: () => void;
}

const UserReportDetail: React.FC<UserReportDetailProps> = ({ userId, userEmail, onBack }) => {
  const [report, setReport] = useState<TransactionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchDetailedReport = async () => {
      setIsLoading(true);
      try {
        const response = await authFetch(`/team/report/user/${userId}?page=${page}`);
        if (!response.ok) throw new Error('Failed to fetch detailed report.');
        setReport(await response.json());
      } catch (error) {
        toast.error('Failed to load detailed report.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetailedReport();
  }, [userId, page]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <LucideArrowLeft />
          </Button>
          <div>
            <CardTitle>Transaction Report for {userEmail}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && !report ? (
          <p>Loading transactions...</p>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Cost (Credits)</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report?.transactions.length ? (
                    report.transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{tx.service_name}</TableCell>
                        <TableCell>{tx.model_name}</TableCell>
                        <TableCell className="text-right">{tx.cost_deducted.toFixed(4)}</TableCell>
                        <TableCell>{new Date(tx.transaction_time).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                        No transactions found for this user.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={!report?.has_prev}>
                Previous
              </Button>
              <span className="text-sm">Page {report?.current_page} of {report?.total_pages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={!report?.has_next}>
                Next
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default UserReportDetail;