import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LucideUsers, LucideMessageSquare, LucideBarChart, LucideSettings, LucideLogOut, LucideKeyRound, LucideArrowLeft } from 'lucide-react';
import { authFetch } from '../../lib/api'; 
import { AiModel, User } from '../../types'; 
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import forge from 'node-forge';

// Import necessary UI components
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '../../contexts/AuthContext';

type AdminTab = 'dashboard' | 'users' | 'conversations' | 'usage' | 'settings' | 'apiKeys';

type ApiKeyInputs = {
  [key: string]: string;
};

// Define the props interface for AdminDashboard
interface AdminDashboardProps {
  onBack: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('apiKeys');

  const [models, setModels] = useState<AiModel[]>([]);
  const [apiKeyInputs, setApiKeyInputs] = useState<ApiKeyInputs>({});
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  const [publicKey, setPublicKey] = useState<string | null>(null);

  // State for user management
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);


  useEffect(() => {
    // Fetch AI models for API Keys tab
    if (activeTab === 'apiKeys') {
      const fetchApiKeysData = async () => {
        setIsLoadingModels(true);
        try {
          const keyResponse = await authFetch('/models/security/public-key');
          if (!keyResponse.ok) throw new Error('Failed to fetch public key.');
          const keyData = await keyResponse.json();
          setPublicKey(keyData.public_key);

          const modelsResponse = await authFetch('/models');
          if (!modelsResponse.ok) throw new Error('Failed to fetch models.');
          const modelsData: AiModel[] = await modelsResponse.json();
          setModels(modelsData);

        } catch (error: any) {
            toast.error(`Failed to load security settings or models: ${error.message || 'Unknown error'}`);
            console.error("Error fetching admin data (API Keys tab):", error);
        } finally {
          setIsLoadingModels(false);
        }
      };
      fetchApiKeysData();
    }

    // Fetch users for User Management tab
    if (activeTab === 'users' && user?.role === 'admin') {
      const fetchUsers = async () => {
        setIsLoadingUsers(true);
        try {
          const usersResponse = await authFetch('/auth/users');
          if (!usersResponse.ok) {
            throw new Error('Failed to fetch users.');
          }
          const usersData: User[] = await usersResponse.json();
          setAllUsers(usersData);
        } catch (error: any) {
          console.error('Error fetching users:', error);
          setUsersError(error.message || 'Failed to load users.');
          toast.error(`Failed to load user data: ${error.message || 'Unknown error'}`);
        } finally {
          setIsLoadingUsers(false);
        }
      };
      fetchUsers();
    }

  }, [activeTab, t, user]);

  const handleApiKeyChange = (modelId: string, value: string) => {
    setApiKeyInputs(prev => ({
      ...prev,
      [modelId]: value,
    }));
  };

  const handleSaveApiKey = async (modelId: string) => {
    const plainTextApiKey = apiKeyInputs[modelId];

    if (!plainTextApiKey) {
      toast.error("API key cannot be empty.");
      return;
    }
    if (!publicKey) {
      toast.error("Encryption key not loaded. Cannot save securely.");
      return;
    }

    let encryptedApiKey: string;

    try {
      const forgePublicKey = forge.pki.publicKeyFromPem(publicKey);

      const encryptedBytes = forgePublicKey.encrypt(plainTextApiKey, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: {
          md: forge.md.sha256.create(),
        },
      });

      encryptedApiKey = forge.util.encode64(encryptedBytes);
      
    } catch (e) {
      console.error("Encryption failed with node-forge:", e);
      toast.error("Client-side encryption failed.");
      return;
    }
    
    if (!encryptedApiKey) {
      toast.error("Encryption resulted in an empty key.");
      return;
    }

    try {
      const response = await authFetch(`/models/${modelId}/api-key`, {
        method: 'PUT',
        body: JSON.stringify({ encrypted_api_key: encryptedApiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update API key.' }));
        throw new Error(errorData.message);
      }

      const result = await response.json();
      toast.success(result.message);
      setApiKeyInputs(prev => ({ ...prev, [modelId]: '' }));

    } catch (error: any) {
      const errorMessage = (error instanceof Error) ? error.message : "An unknown error occurred.";
      toast.error(errorMessage);
      console.error(`Error updating API key for ${modelId}:`, error);
    }
  };

  const handleUpdateUserRole = async (userId: number, newRole: 'user' | 'admin') => {
    try {
      const response = await authFetch('/admin/update_role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update user role.');
      }

      setAllUsers(prevUsers => prevUsers.map(u =>
        u.id === userId ? { ...u, role: newRole } : u
      ));

      toast.success(t('userRoleUpdated', 'User role updated successfully.'));

    } catch (error: any) {
      console.error('Error updating user role:', error);
      toast.error(t('failedToUpdateUserRole', 'Failed to update user role.'), {
        description: error.message || 'An unexpected error occurred.',
      });
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Tableau de bord</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            </div>
          </div>
        );
        
      case 'users':
        if (isLoadingUsers) {
          return <p>{t('loadingUsers', 'Loading users...')}</p>;
        }
        if (usersError) {
          return <p className="text-red-500">{t('errorLoadingUsers', 'Error loading users:')} {usersError}</p>;
        }
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Gestion des utilisateurs</h2>
            <div className="space-y-4">
              {allUsers.length === 0 ? (
                <p>{t('noUsersFound', 'No users found.')}</p>
              ) : (
                allUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700">
                    <div>
                      <h3 className="font-medium">{u.full_name} ({u.email})</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-300">
                        {t('roleLabel', 'Role')}: {u.role}
                      </p>
                    </div>
                    <div className="flex items-center space-x-4 rtl:space-x-reverse">
                      <Label htmlFor={`admin-switch-${u.id}`} className="flex items-center gap-2 cursor-pointer">
                        <span>{t('adminRole', 'Admin')}</span>
                        <Switch
                          id={`admin-switch-${u.id}`}
                          checked={u.role === 'admin'}
                          onCheckedChange={(checked) => handleUpdateUserRole(u.id, checked ? 'admin' : 'user')}
                          disabled={user?.id === u.id}
                          className="data-[state=checked]:bg-[#6B5CA5]"
                        />
                      </Label>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
        
      case 'conversations':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Gestion des conversations</h2>
          </div>
        );
        
      case 'usage':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Surveillance de l'utilisation</h2>
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
          </div>
        );
      default:
        return null;
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <h2 className="text-2xl font-bold mb-4">{t('accessDenied', 'Access Denied')}</h2>
        <p className="text-gray-600 dark:text-gray-400">{t('adminAccessRequired', 'You must be an administrator to view this page.')}</p>
        <Button onClick={onBack} className="mt-6 bg-[#6B5CA5] hover:bg-[#5d4f91] text-white">
          <LucideArrowLeft size={18} className="mr-2" />
          {t('backToChat', 'Back to Chat')}
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 flex text-gray-900 dark:text-gray-100">
      <div className="w-64 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center">
          <img src="/images/logo-wisdar.png" alt="Wisdar" className="h-8" />
          <span className="ml-2 font-medium">Administration</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
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