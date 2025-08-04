import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    LucideUsers, 
    LucideMessageSquare, 
    LucideBarChart, 
    LucideSettings, 
    LucideLogOut, 
    LucideKeyRound, 
    LucideArrowLeft,
    LucideCoins,
    LucideListTree 
} from 'lucide-react';
import ServiceManagementPanel from './ServiceManagementPanel';
import { authFetch } from '../../lib/api'; 
import { AiProvider } from '../../types'; 
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import forge from 'node-forge';

// Import necessary UI components
import UserManagementPanel from './UserManagementPanel';
import { useAuth } from '../../contexts/AuthContext';
import ServiceCostsPanel from './ServiceCostsPanel'; // Import the new component

// Add 'creditCosts' to the available tabs
type AdminTab = 'dashboard' | 'users' | 'conversations' | 'usage' | 'settings' | 'apiKeys' | 'creditCosts'| 'services';

type ApiKeyInputs = {
  [key: string]: string;
};

interface AdminDashboardProps {
  onBack: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const { t } = useTranslation();
  // Get user and logout function from auth context
  const { user, logout } = useAuth();
  // Set the new tab as the default for easy viewing
  const [activeTab, setActiveTab] = useState<AdminTab>('creditCosts');

  // --- [MODIFIED] State now holds providers, not old models ---
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [apiKeyInputs, setApiKeyInputs] = useState<ApiKeyInputs>({});
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  
  const [publicKey, setPublicKey] = useState<string | null>(null);




  useEffect(() => {
    if (activeTab === 'apiKeys') {
      const fetchApiKeysData = async () => {
        setIsLoadingProviders(true);
        try {
          // [MODIFIED] Use the correct admin route for the public key
          const keyResponse = await authFetch('/admin/security/public-key');
          if (!keyResponse.ok) throw new Error('Failed to fetch public key.');
          const keyData = await keyResponse.json();
          setPublicKey(keyData.public_key);

          // [MODIFIED] Use the new /api/providers endpoint to get the list of providers
          const providersResponse = await authFetch('/providers');
          if (!providersResponse.ok) throw new Error('Failed to fetch providers.');
          const providersData: AiProvider[] = await providersResponse.json();
          setProviders(providersData);

        } catch (error: any) {
            toast.error(`Failed to load API Key settings: ${error.message || 'Unknown error'}`);
        } finally {
          setIsLoadingProviders(false);
        }
      };
      fetchApiKeysData();
    }


  }, [activeTab, user, t]);

  const handleApiKeyChange = (modelId: string, value: string) => {
    setApiKeyInputs(prev => ({ ...prev, [modelId]: value }));
  };
  


  // --- [MODIFIED] This handler now updates the key for a provider ---
  const handleSaveApiKey = async (providerId: string) => {
    const plainTextApiKey = apiKeyInputs[providerId];
    if (!plainTextApiKey || !publicKey) return;

    try {
      // Encryption logic is the same, which is great.
      const forgePublicKey = forge.pki.publicKeyFromPem(publicKey);
      const encryptedBytes = forgePublicKey.encrypt(plainTextApiKey, 'RSA-OAEP', {
        md: forge.md.sha256.create(), mgf1: { md: forge.md.sha256.create() },
      });
      const encryptedApiKey = forge.util.encode64(encryptedBytes);
      
      // [MODIFIED] Call the new, correct endpoint for updating a provider's key
      const response = await authFetch(`/admin/providers/${providerId}/api-key`, {
        method: 'PUT',
        body: JSON.stringify({ encrypted_api_key: encryptedApiKey }),
      });
      if (!response.ok) throw new Error((await response.json()).message);
      
      toast.success((await response.json()).message);
      setApiKeyInputs(prev => ({ ...prev, [providerId]: '' })); // Clear the input field
    } catch (error: any) {
      toast.error(error.message || "An unknown error occurred while saving the key.");
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'creditCosts':
        return <ServiceCostsPanel />;
      case 'dashboard':
        return <h2 className="text-2xl font-semibold">Tableau de bord</h2>;
      case 'users':
        return <UserManagementPanel />; 
      case 'apiKeys':
        return (
            <div className="space-y-6">
                <h2 className="text-2xl font-semibold">Manage Provider API Keys</h2>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-medium mb-1">AI Providers</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Update the API key for each available AI provider.</p>
                    <div className="space-y-6">
                        {/* [MODIFIED] We now map over 'providers' instead of 'models' */}
                        {isLoadingProviders ? <p>Loading Providers...</p> : providers.map((provider) => (
                            <div key={provider.id} className="p-4 border dark:border-gray-700 rounded-lg">
                                <h4 className="font-semibold">{provider.name}</h4>
                                <div className="flex items-center gap-2 mt-2">
                                    <Input 
                                      type="password" 
                                      placeholder={`Enter new API key for ${provider.name}`}
                                      value={apiKeyInputs[provider.id] || ''} 
                                      onChange={(e) => handleApiKeyChange(provider.id, e.target.value)} 
                                    />
                                    <Button 
                                      onClick={() => handleSaveApiKey(provider.id)} 
                                      disabled={!publicKey || !apiKeyInputs[provider.id]}
                                    >
                                      Save
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
        case 'services':
        return <ServiceManagementPanel />;
        default:
        return <p>Section {activeTab} coming soon.</p>;
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <h2 className="text-2xl font-bold mb-4">{t('accessDenied')}</h2>
        <Button onClick={onBack} className="mt-6"><LucideArrowLeft size={18} className="mr-2" />{t('backToChat')}</Button>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 flex text-gray-900 dark:text-gray-100">
      <div className="w-64 h-full bg-white dark:bg-gray-800 border-r flex flex-col">
        <div className="p-4 border-b flex items-center">
          <img src="/images/logo-wisdar.png" alt="Wisdar" className="h-8" />
          <span className="ml-2 font-medium">Administration</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'dashboard' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideBarChart size={18} /><span>Tableau de bord</span>
          </button>
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'users' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideUsers size={18} /><span>Utilisateurs</span>
          </button>
          <button onClick={() => setActiveTab('conversations')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'conversations' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideMessageSquare size={18} /><span>Conversations</span>
          </button>
          <button onClick={() => setActiveTab('usage')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'usage' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideBarChart size={18} /><span>Utilisation</span>
          </button>
          <button onClick={() => setActiveTab('apiKeys')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'apiKeys' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideKeyRound size={18} /><span>Clés API</span>
          </button>
          <button onClick={() => setActiveTab('creditCosts')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'creditCosts' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideCoins size={18} /><span>{t('admin.creditCosts', 'Coûts des crédits')}</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'settings' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideSettings size={18} /><span>Paramètres</span>
          </button>
          <button onClick={() => setActiveTab('services')} className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${activeTab === 'services' ? 'bg-[#6B5CA5] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LucideListTree size={18} /><span>Manage Services</span>
          </button>
        </nav>
        
        <div className="p-4 border-t space-y-2">
          <button onClick={onBack} className="w-full flex items-center gap-3 p-3 rounded-md text-left hover:bg-gray-100 dark:hover:bg-gray-700">
            <LucideArrowLeft size={18} /><span>{t('backToChat')}</span>
          </button>
          <button onClick={logout} className="w-full flex items-center gap-3 p-3 rounded-md text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
            <LucideLogOut size={18} />
            <span>{t('logout', 'Déconnexion')}</span>
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
