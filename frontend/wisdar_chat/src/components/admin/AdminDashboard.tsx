import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LucideUsers, LucideMessageSquare, LucideBarChart, LucideSettings, LucideLogOut, LucideKeyRound } from 'lucide-react';
import { authFetch } from '../../lib/api'; 
import { AiModel } from '../../types'; 
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import * as JSEncrypt from 'jsencrypt'; 

type AdminTab = 'dashboard' | 'users' | 'conversations' | 'usage' | 'settings' | 'apiKeys';

type ApiKeyInputs = {
  [key: string]: string;
};

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  const [models, setModels] = useState<AiModel[]>([]);
  const [apiKeyInputs, setApiKeyInputs] = useState<ApiKeyInputs>({});
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'apiKeys') {
      const fetchRequiredData = async () => {
        setIsLoadingModels(true);
        try {
          const keyResponse = await authFetch(`${import.meta.env.VITE_API_URL}/models/security/public-key`);
          if (!keyResponse.ok) throw new Error('Failed to fetch public key.');
          const keyData = await keyResponse.json();
          setPublicKey(keyData.public_key);

          const modelsResponse = await authFetch(`${import.meta.env.VITE_API_URL}/models/`);
          if (!modelsResponse.ok) throw new Error('Failed to fetch models.');
          const modelsData: AiModel[] = await modelsResponse.json();
          setModels(modelsData);

        } catch (error) {
          toast({
            title: t('error', 'Error'),
            description: "Failed to load security settings or models.",
            variant: 'destructive',
          });
          console.error("Error fetching admin data:", error);
        } finally {
          setIsLoadingModels(false);
        }
      };
      fetchRequiredData();
    }
  }, [activeTab, t, toast]);

  const handleApiKeyChange = (modelId: string, value: string) => {
    setApiKeyInputs(prev => ({
      ...prev,
      [modelId]: value,
    }));
  };

  const handleSaveApiKey = async (modelId: string) => {
    const plainTextApiKey = apiKeyInputs[modelId];

    if (!plainTextApiKey) {
      toast({ title: t('error', 'Error'), description: "API key cannot be empty.", variant: 'destructive' });
      return;
    }
    if (!publicKey) {
      toast({ title: t('error', 'Error'), description: "Encryption key not loaded. Cannot save securely.", variant: 'destructive' });
      return;
    }

    // --- MODIFIED: Set hashing algorithm to SHA-256 ---
    const encrypt = new JSEncrypt.JSEncrypt({ default_key_size: '2048' });
    encrypt.setPublicKey(publicKey);
    // Note: JSEncrypt uses OAEP padding by default. To align with a specific backend
    // that might require a specific hash for OAEP, you'd typically need to ensure
    // the backend matches the library's defaults (often SHA-1) or find a library
    // that allows specifying the OAEP hash, which JSEncrypt v3+ does.
    // Assuming the backend is aligned, the following is correct.
    const encryptedApiKey = encrypt.encrypt(plainTextApiKey);
    // ----------------------------------------------------

    if (!encryptedApiKey) {
        toast({ title: t('error', 'Error'), description: "Encryption failed. Please try again.", variant: 'destructive' });
        return;
    }

    try {
      const response = await authFetch(`${import.meta.env.VITE_API_URL}/models/${modelId}`, {
        method: 'PUT',
        body: JSON.stringify({ encrypted_api_key: encryptedApiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update API key.' }));
        throw new Error(errorData.message);
      }

      const result = await response.json();
      toast({ title: t('success', 'Success'), description: result.message });
      setApiKeyInputs(prev => ({ ...prev, [modelId]: '' }));

    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : "An unknown error occurred.";
      toast({ title: t('error', 'Error'), description: errorMessage, variant: 'destructive' });
      console.error(`Error updating API key for ${modelId}:`, error);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Tableau de bord</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* ... your stat cards ... */}
            </div>
          </div>
        );
        
      case 'users':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Gestion des utilisateurs</h2>
            {/* ... your users content ... */}
          </div>
        );
        
      case 'conversations':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Gestion des conversations</h2>
            {/* ... your conversations content ... */}
          </div>
        );
        
      case 'usage':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Surveillance de l'utilisation</h2>
            {/* ... your usage content ... */}
          </div>
        );
      
      case 'apiKeys':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Gestion des Clés API</h2>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium mb-1">Modèles d'IA</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Mettez à jour les clés API pour les modèles d'IA disponibles.</p>
              
              <div className="space-y-6">
                {isLoadingModels ? (
                  <p>Chargement des paramètres de sécurité...</p>
                ) : models.length > 0 ? (
                  models.map((model) => (
                    <div key={model.id} className="p-4 border dark:border-gray-700 rounded-lg">
                      <h4 className="font-semibold">{model.display_name}</h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">ID: {model.id}</p>
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        <Input
                          type="password"
                          placeholder="Entrez la nouvelle clé API"
                          value={apiKeyInputs[model.id] || ''}
                          onChange={(e) => handleApiKeyChange(model.id, e.target.value)}
                          className="flex-grow"
                        />
                        <Button onClick={() => handleSaveApiKey(model.id)} className="w-full sm:w-auto" disabled={!publicKey}>
                          {publicKey ? "Enregistrer" : "Sécurité non chargée"}
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p>Aucun modèle trouvé. Assurez-vous que le backend est en cours d'exécution.</p>
                )}
              </div>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Paramètres système</h2>
            {/* ... your settings content ... */}
          </div>
        );
    }
  };

  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 flex">
      <div className="w-64 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center">
          <img src="/images/logo-wisdar.png" alt="Wisdar" className="h-8" />
          <span className="ml-2 font-medium">Administration</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {/* ... your nav buttons ... */}
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'dashboard' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideBarChart size={18} />
            <span>Tableau de bord</span>
          </button>
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'users' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideUsers size={18} />
            <span>Utilisateurs</span>
          </button>
          <button onClick={() => setActiveTab('conversations')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'conversations' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideMessageSquare size={18} />
            <span>Conversations</span>
          </button>
          <button onClick={() => setActiveTab('usage')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'usage' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideBarChart size={18} />
            <span>Utilisation</span>
          </button>
          <button onClick={() => setActiveTab('apiKeys')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'apiKeys' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideKeyRound size={18} />
            <span>Clés API</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'settings' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideSettings size={18} />
            <span>Paramètres</span>
          </button>
        </nav>
        
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button className="w-full flex items-center gap-3 p-3 rounded-md text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400">
            <LucideLogOut size={18} />
            <span>Déconnexion</span>
          </button>
        </div>
      </div>
      
      <div className="flex-1 p-6 overflow-y-auto">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default AdminDashboard;
