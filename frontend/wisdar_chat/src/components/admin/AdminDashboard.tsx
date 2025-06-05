import React, { useState } from 'react';
import { LucideUsers, LucideMessageSquare, LucideBarChart, LucideSettings, LucideLogOut } from 'lucide-react';

type AdminTab = 'dashboard' | 'users' | 'conversations' | 'usage' | 'settings';

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Tableau de bord</h2>
            
            {/* Cartes de statistiques */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-gray-500 dark:text-gray-400">Utilisateurs</h3>
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <LucideUsers size={20} className="text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <p className="text-3xl font-bold mt-2">1,234</p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-2">+12% depuis le mois dernier</p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-gray-500 dark:text-gray-400">Conversations</h3>
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                    <LucideMessageSquare size={20} className="text-[#6B5CA5]" />
                  </div>
                </div>
                <p className="text-3xl font-bold mt-2">5,678</p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-2">+8% depuis le mois dernier</p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-gray-500 dark:text-gray-400">Utilisation</h3>
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                    <LucideBarChart size={20} className="text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
                <p className="text-3xl font-bold mt-2">89%</p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">+15% depuis le mois dernier</p>
              </div>
            </div>
            
            {/* Graphique d'activité */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium mb-4">Activité récente</h3>
              <div className="h-64 flex items-center justify-center text-gray-500">
                Graphique d'activité (à implémenter avec Recharts)
              </div>
            </div>
            
            {/* Utilisateurs récents */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium mb-4">Utilisateurs récents</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nom</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date d'inscription</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap">John Doe</td>
                      <td className="px-6 py-4 whitespace-nowrap">john@example.com</td>
                      <td className="px-6 py-4 whitespace-nowrap">01/06/2025</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Actif</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap">Jane Smith</td>
                      <td className="px-6 py-4 whitespace-nowrap">jane@example.com</td>
                      <td className="px-6 py-4 whitespace-nowrap">02/06/2025</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Actif</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap">Robert Johnson</td>
                      <td className="px-6 py-4 whitespace-nowrap">robert@example.com</td>
                      <td className="px-6 py-4 whitespace-nowrap">03/06/2025</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">Inactif</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
        
      case 'users':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold">Gestion des utilisateurs</h2>
              <button className="px-4 py-2 bg-[#6B5CA5] text-white rounded-md hover:bg-[#5d4f91] transition-colors">
                Ajouter un utilisateur
              </button>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Rechercher un utilisateur..."
                    className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5] bg-white dark:bg-gray-800"
                  />
                  <svg className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div>
                  <select className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5] bg-white dark:bg-gray-800">
                    <option>Tous les utilisateurs</option>
                    <option>Actifs</option>
                    <option>Inactifs</option>
                  </select>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nom</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rôle</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Statut</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap">Utilisateur {index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap">user{index + 1}@example.com</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {index === 0 ? 'Admin' : 'Utilisateur'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            index % 3 === 0 
                              ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' 
                              : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {index % 3 === 0 ? 'Inactif' : 'Actif'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-2">
                            <button className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                              Modifier
                            </button>
                            <button className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Affichage de 1 à 10 sur 100 utilisateurs
                </div>
                <div className="flex space-x-2">
                  <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md">Précédent</button>
                  <button className="px-3 py-1 bg-[#6B5CA5] text-white rounded-md">1</button>
                  <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md">2</button>
                  <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md">3</button>
                  <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md">Suivant</button>
                </div>
              </div>
            </div>
          </div>
        );
        
      case 'conversations':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Gestion des conversations</h2>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Rechercher une conversation..."
                    className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5] bg-white dark:bg-gray-800"
                  />
                  <svg className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div>
                  <select className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5] bg-white dark:bg-gray-800">
                    <option>Toutes les conversations</option>
                    <option>Aujourd'hui</option>
                    <option>Cette semaine</option>
                    <option>Ce mois</option>
                  </select>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Utilisateur</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Titre</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Messages</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap">CONV-{1000 + index}</td>
                        <td className="px-6 py-4 whitespace-nowrap">Utilisateur {index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap">Conversation sur le sujet {index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{`0${index + 1}/06/2025`}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{Math.floor(Math.random() * 20) + 5}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-2">
                            <button className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                              Voir
                            </button>
                            <button className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Affichage de 1 à 10 sur 256 conversations
                </div>
                <div className="flex space-x-2">
                  <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md">Précédent</button>
                  <button className="px-3 py-1 bg-[#6B5CA5] text-white rounded-md">1</button>
                  <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md">2</button>
                  <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md">3</button>
                  <button className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md">Suivant</button>
                </div>
              </div>
            </div>
          </div>
        );
        
      case 'usage':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Surveillance de l'utilisation</h2>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium mb-4">Utilisation par jour</h3>
              <div className="h-64 flex items-center justify-center text-gray-500">
                Graphique d'utilisation quotidienne (à implémenter avec Recharts)
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium mb-4">Top 5 utilisateurs</h3>
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-[#6B5CA5] flex items-center justify-center text-white mr-3">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">Utilisateur {index + 1}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">user{index + 1}@example.com</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{1000 - index * 150} messages</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{50 - index * 5} conversations</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium mb-4">Utilisation par type</h3>
                <div className="h-64 flex items-center justify-center text-gray-500">
                  Graphique d'utilisation par type (à implémenter avec Recharts)
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium mb-4">Paramètres de limite d'utilisation</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Limite de messages par utilisateur (par jour)</label>
                  <input 
                    type="number" 
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5]"
                    placeholder="100"
                    defaultValue={100}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Limite de conversations par utilisateur</label>
                  <input 
                    type="number" 
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5]"
                    placeholder="50"
                    defaultValue={50}
                  />
                </div>
                
                <div className="flex items-center mt-4">
                  <input 
                    type="checkbox" 
                    id="alert-admins" 
                    className="h-4 w-4 text-[#6B5CA5] focus:ring-[#6B5CA5] border-gray-300 rounded"
                    defaultChecked
                  />
                  <label htmlFor="alert-admins" className="ml-2 block text-sm">
                    Alerter les administrateurs en cas de dépassement de limite
                  </label>
                </div>
                
                <div className="pt-4">
                  <button className="px-4 py-2 bg-[#6B5CA5] text-white rounded-md hover:bg-[#5d4f91] transition-colors">
                    Enregistrer les paramètres
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
        
      case 'settings':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Paramètres système</h2>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium mb-4">Paramètres généraux</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nom de l'application</label>
                  <input 
                    type="text" 
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5]"
                    defaultValue="Wisdar Chat"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">URL de base</label>
                  <input 
                    type="text" 
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5]"
                    defaultValue="https://chat.wisdar.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea 
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5]"
                    rows={3}
                    defaultValue="Plateforme de chat intelligente par Wisdar"
                  ></textarea>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium mb-4">Configuration de l'API</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Clé API</label>
                  <div className="flex">
                    <input 
                      type="password" 
                      className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-l-md focus:ring-2 focus:ring-[#6B5CA5]"
                      defaultValue="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                    <button className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-r-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                      Afficher
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Modèle</label>
                  <select className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-[#6B5CA5]">
                    <option>gpt-4</option>
                    <option selected>gpt-3.5-turbo</option>
                    <option>claude-3-opus</option>
                    <option>claude-3-sonnet</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Température</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1" 
                    defaultValue="0.7"
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Plus précis</span>
                    <span>Plus créatif</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end">
              <button className="px-4 py-2 bg-[#6B5CA5] text-white rounded-md hover:bg-[#5d4f91] transition-colors">
                Enregistrer tous les paramètres
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 flex">
      {/* Barre latérale */}
      <div className="w-64 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* En-tête avec logo */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center">
          <img 
            src="/images/logo-wisdar.png" 
            alt="Wisdar" 
            className="h-8" 
          />
          <span className="ml-2 font-medium">Administration</span>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${
              activeTab === 'dashboard'
                ? 'bg-[#6B5CA5] text-white'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <LucideBarChart size={18} />
            <span>Tableau de bord</span>
          </button>
          
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${
              activeTab === 'users'
                ? 'bg-[#6B5CA5] text-white'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <LucideUsers size={18} />
            <span>Utilisateurs</span>
          </button>
          
          <button
            onClick={() => setActiveTab('conversations')}
            className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${
              activeTab === 'conversations'
                ? 'bg-[#6B5CA5] text-white'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <LucideMessageSquare size={18} />
            <span>Conversations</span>
          </button>
          
          <button
            onClick={() => setActiveTab('usage')}
            className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${
              activeTab === 'usage'
                ? 'bg-[#6B5CA5] text-white'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <LucideBarChart size={18} />
            <span>Utilisation</span>
          </button>
          
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 p-3 rounded-md text-left ${
              activeTab === 'settings'
                ? 'bg-[#6B5CA5] text-white'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <LucideSettings size={18} />
            <span>Paramètres</span>
          </button>
        </nav>
        
        {/* Pied avec déconnexion */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button className="w-full flex items-center gap-3 p-3 rounded-md text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400">
            <LucideLogOut size={18} />
            <span>Déconnexion</span>
          </button>
        </div>
      </div>
      
      {/* Contenu principal */}
      <div className="flex-1 p-6 overflow-y-auto">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default AdminDashboard;
