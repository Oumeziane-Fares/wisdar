import React, { useState, useEffect } from 'react';
import { authFetch } from '../../lib/api';
import { AiProvider } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface ServiceFormProps {
  onSave: () => void;
  onCancel: () => void;
}

// These are the core service types your application supports
const coreServiceTypes = [
    { id: 'chat', name: 'Chat' },
    { id: 'chat-search', name: 'Web Chat' },
    { id: 'image', name: 'Image Generation' },
    { id: 'tts', name: 'Text-to-Speech' },
    { id: 'transcription', name: 'Audio Transcription' },
];

const ServiceForm: React.FC<ServiceFormProps> = ({ onSave, onCancel }) => {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [providerId, setProviderId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [modelApiId, setModelApiId] = useState('');
  
  // Fetch providers to populate the dropdown
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await authFetch('/providers');
        setProviders(await response.json());
      } catch (error) {
        toast.error("Failed to load AI providers.");
      }
    };
    fetchProviders();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId || !serviceId || !displayName || !modelApiId) {
        toast.error("Please fill out all required fields.");
        return;
    }
    setIsLoading(true);

    // The payload no longer contains cost information.
    const payload = {
      provider_id: providerId,
      service_id: serviceId,
      display_name: displayName,
      model_api_id: modelApiId,
    };

    try {
      const response = await authFetch('/admin/provider-services', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      toast.success("New service added successfully!");
      onSave();
    } catch (error: any) {
      toast.error("Failed to add service", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="provider">Provider</Label>
          <Select onValueChange={setProviderId} required>
            <SelectTrigger id="provider"><SelectValue placeholder="Select a provider..." /></SelectTrigger>
            <SelectContent>
              {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="service-type">Service Type</Label>
          <Select onValueChange={setServiceId} required>
            <SelectTrigger id="service-type"><SelectValue placeholder="Select a type..." /></SelectTrigger>
            <SelectContent>
              {coreServiceTypes.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="display-name">Display Name</Label>
        <Input id="display-name" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g., GPT-4o (Vision)" required/>
      </div>
      <div className="space-y-2">
        <Label htmlFor="model-id">Model API ID</Label>
        <Input id="model-id" value={modelApiId} onChange={e => setModelApiId(e.target.value)} placeholder="e.g., gpt-4o" required/>
      </div>

      {/* --- THIS ENTIRE BLOCK HAS BEEN REMOVED --- */}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Add Service"}</Button>
      </div>
    </form>
  );
};

export default ServiceForm;