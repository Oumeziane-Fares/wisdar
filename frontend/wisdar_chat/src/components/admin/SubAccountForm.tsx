// src/components/admin/SubAccountForm.tsx

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AiProvider, User } from '@/types';
import { authFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface SubAccountFormProps {
  editingUser: User | null;
  onSave: () => void;
  onCancel: () => void;
}

const SubAccountForm: React.FC<SubAccountFormProps> = ({ editingUser, onSave, onCancel }) => {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [creditLimit, setCreditLimit] = useState<string | number>('');
  
  const [availableServices, setAvailableServices] = useState<AiProvider[]>([]);
  const [selectedServices, setSelectedServices] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await authFetch('/providers');
        const data: AiProvider[] = await response.json();
        setAvailableServices(data);
      } catch (error) {
        toast.error('Failed to load available AI services.');
      }
    };
    fetchServices();
  }, []);

  useEffect(() => {
    if (editingUser) {
      setFullName(editingUser.full_name);
      setEmail(editingUser.email);
      setCreditLimit(editingUser.credit_limit ?? '');
      setSelectedServices(new Set());
    }
  }, [editingUser]);

  const handleServiceToggle = (providerServiceId: number) => {
    setSelectedServices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(providerServiceId)) {
        newSet.delete(providerServiceId);
      } else {
        newSet.add(providerServiceId);
      }
      return newSet;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const payload = {
      full_name: fullName,
      email: email,
      credit_limit: creditLimit === '' ? null : Number(creditLimit),
      allowed_service_ids: Array.from(selectedServices)
    };

    const endpoint = editingUser ? `/team/sub_accounts/${editingUser.id}` : '/team/sub_accounts';
    const method = editingUser ? 'PUT' : 'POST';

    try {
      const response = await authFetch(endpoint, {
        method: method,
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'An unknown error occurred.');
      toast.success(editingUser ? 'User updated successfully!' : 'Invitation sent successfully!');
      onSave();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ... (form inputs for name, email, credit limit are unchanged) ... */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
            <Label htmlFor="fullName">{t('team.form.fullName', 'Full Name')}</Label>
            <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} required />
        </div>
        <div className="space-y-2">
            <Label htmlFor="email">{t('team.form.email', 'Email Address')}</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={!!editingUser} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="creditLimit">{t('team.form.creditLimit', 'Credit Limit (Optional)')}</Label>
        <Input id="creditLimit" type="number" placeholder="Leave blank for unlimited" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} />
      </div>


      <div className="space-y-2">
        <Label>{t('team.form.permissions', 'Service Permissions')}</Label>
        <ScrollArea className="h-48 rounded-md border p-4">
            {availableServices.map(provider => (
                <div key={provider.id} className="mb-4">
                    <h4 className="font-semibold mb-2 text-sm text-gray-800 dark:text-gray-200">{provider.name}</h4>
                    <div className="space-y-2">
                        {provider.services
                            // Step 1: Filter the array to only include services with a valid ID
                            .filter(service => service.providerServiceId !== undefined)
                            // Step 2: Now map over the filtered array. 'service.providerServiceId' is now guaranteed to be a number.
                            .map(service => (
                                <div key={service.providerServiceId} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={String(service.providerServiceId)}
                                        onCheckedChange={() => handleServiceToggle(service.providerServiceId!)} // The '!' can also help assure TypeScript
                                        checked={selectedServices.has(service.providerServiceId!)}
                                    />
                                    <Label htmlFor={String(service.providerServiceId)} className="font-normal text-xs leading-snug">
                                        {service.name} <span className="text-gray-500">({service.modelId})</span>
                                    </Label>
                                </div>
                            ))
                        }
                    </div>
                </div>
            ))}
        </ScrollArea>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>{t('cancelButton', 'Cancel')}</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? t('saving', 'Saving...') : (editingUser ? t('saveChanges', 'Save Changes') : t('sendInvitation', 'Send Invitation'))}
        </Button>
      </div>
    </form>
  );
};

export default SubAccountForm;