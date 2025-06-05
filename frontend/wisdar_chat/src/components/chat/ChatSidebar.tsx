import React from 'react';
import { LucideMessageSquare, LucidePlus, LucideSearch, LucideSettings } from 'lucide-react';

interface Conversation {
  id: string;
  title: string;
  date: string;
  active?: boolean;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  conversations,
  onSelectConversation,
  onNewConversation,
  onOpenSettings
}) => {
  return (
    <div className="w-64 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* En-tête avec logo */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center">
        <img 
          src="/images/logo-wisdar.png" 
          alt="Wisdar" 
          className="h-8" 
        />
      </div>
      
      {/* Bouton nouvelle conversation */}
      <button 
        onClick={onNewConversation}
        className="mx-4 my-3 flex items-center justify-center gap-2 p-2 rounded-md bg-[#6B5CA5] text-white hover:bg-[#5d4f91] transition-colors"
      >
        <LucidePlus size={18} />
        <span>Nouvelle conversation</span>
      </button>
      
      {/* Barre de recherche */}
      <div className="px-4 pb-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Rechercher..."
            className="w-full p-2 pl-8 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-[#6B5CA5]"
          />
          <LucideSearch size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
      </div>
      
      {/* Liste des conversations */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Conversations récentes
        </div>
        <div className="space-y-1 px-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              className={`w-full text-left p-2 rounded-md flex items-start gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                conversation.active ? 'bg-gray-100 dark:bg-gray-700' : ''
              }`}
            >
              <LucideMessageSquare size={18} className="mt-0.5 text-[#6B5CA5]" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{conversation.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{conversation.date}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Pied avec paramètres */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button 
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <LucideSettings size={18} className="text-gray-500" />
          <span>Paramètres</span>
        </button>
      </div>
    </div>
  );
};

export default ChatSidebar;
