import React, { useState } from 'react';
import { LucideArrowLeft, LucideMoon, LucideSun, LucideUser, LucideBell, LucideLock } from 'lucide-react';
import { useTheme } from '../ui/ThemeProvider';

interface SettingsPanelProps {
  onBack: () => void;
}

type SettingsTab = 'profile' | 'appearance' | 'notifications' | 'privacy';

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const { theme, setTheme } = useTheme();

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Profil</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nom d'utilisateur</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5]"
                  placeholder="Votre nom d'utilisateur"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input 
                  type="email" 
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5]"
                  placeholder="votre.email@exemple.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Photo de profil</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <LucideUser size={32} className="text-gray-500 dark:text-gray-400" />
                  </div>
                  <button className="px-3 py-1 bg-[#6B5CA5] text-white rounded-md hover:bg-[#5d4f91] transition-colors">
                    Modifier
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
        
      case 'appearance':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Apparence</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-3">Thème</label>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setTheme('light')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border ${
                      theme === 'light' 
                        ? 'border-[#6B5CA5] bg-[#6B5CA5]/10' 
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                      <LucideSun size={24} className="text-orange-500" />
                    </div>
                    <span>Clair</span>
                  </button>
                  
                  <button 
                    onClick={() => setTheme('dark')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border ${
                      theme === 'dark' 
                        ? 'border-[#6B5CA5] bg-[#6B5CA5]/10' 
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center shadow-sm">
                      <LucideMoon size={24} className="text-gray-200" />
                    </div>
                    <span>Sombre</span>
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Taille de police</label>
                <select className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5]">
                  <option>Petite</option>
                  <option selected>Normale</option>
                  <option>Grande</option>
                  <option>Très grande</option>
                </select>
              </div>
            </div>
          </div>
        );
        
      case 'notifications':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Notifications</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Notifications par email</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Recevoir des notifications par email</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-[#6B5CA5]"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Notifications de nouvelles fonctionnalités</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Être informé des nouvelles fonctionnalités</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-[#6B5CA5]"></div>
                </label>
              </div>
            </div>
          </div>
        );
        
      case 'privacy':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Confidentialité</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Historique des conversations</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Conserver l'historique des conversations</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-[#6B5CA5]"></div>
                </label>
              </div>
              
              <div>
                <button className="w-full p-2 mt-4 text-red-500 border border-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  Supprimer toutes les conversations
                </button>
              </div>
              
              <div>
                <button className="w-full p-2 mt-2 text-red-600 border border-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  Supprimer mon compte
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="w-full h-full bg-white dark:bg-gray-900 flex flex-col">
      {/* En-tête */}
      <div className="py-3 px-4 border-b border-gray-200 dark:border-gray-700 flex items-center">
        <button 
          onClick={onBack}
          className="p-1 mr-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <LucideArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-medium">Paramètres</h1>
      </div>
      
      {/* Contenu */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation latérale */}
        <div className="w-64 border-r border-gray-200 dark:border-gray-700 p-4">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${
                activeTab === 'profile'
                  ? 'bg-[#6B5CA5] text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <LucideUser size={18} />
              <span>Profil</span>
            </button>
            
            <button
              onClick={() => setActiveTab('appearance')}
              className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${
                activeTab === 'appearance'
                  ? 'bg-[#6B5CA5] text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {theme === 'light' ? <LucideSun size={18} /> : <LucideMoon size={18} />}
              <span>Apparence</span>
            </button>
            
            <button
              onClick={() => setActiveTab('notifications')}
              className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${
                activeTab === 'notifications'
                  ? 'bg-[#6B5CA5] text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <LucideBell size={18} />
              <span>Notifications</span>
            </button>
            
            <button
              onClick={() => setActiveTab('privacy')}
              className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${
                activeTab === 'privacy'
                  ? 'bg-[#6B5CA5] text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <LucideLock size={18} />
              <span>Confidentialité</span>
            </button>
          </nav>
        </div>
        
        {/* Contenu de l'onglet */}
        <div className="flex-1 p-6 overflow-y-auto">
          {renderTabContent()}
          
          <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <button 
              onClick={onBack}
              className="px-4 py-2 mr-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Annuler
            </button>
            <button 
              className="px-4 py-2 bg-[#6B5CA5] text-white rounded-md hover:bg-[#5d4f91] transition-colors"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
