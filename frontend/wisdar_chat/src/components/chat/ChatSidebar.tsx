import React from 'react';
import { useTranslation } from 'react-i18next';
import { LucideMessageSquare, LucidePlus, LucideSettings, LucideLogOut } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { LucideShield } from 'lucide-react'; // Add this import
import { useAuth } from '../../contexts/AuthContext';
// MODIFIED: Import the shared Conversation type
import { Conversation } from '../../types';

// MODIFIED: Local interface definition is removed.

interface ChatSidebarProps {
  conversations: Conversation[]; // This now uses the correct, imported type
  onSelectConversation: (id: string | number) => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void; // Add this line
  onLogout: () => void; // Added onLogout prop
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  conversations,
  onSelectConversation,
  onNewConversation,
  onOpenSettings,
  onOpenAdmin, // Add this prop
}) => {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth(); 

  return (
    <div className="w-64 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
            <img src="/images/logo-wisdar.png" alt="Wisdar" className="h-8" />
            {user && <span className="text-sm text-gray-600 dark:text-gray-300 truncate">{user.full_name}</span>}
        </div>
      </div>
      
      {/* New Conversation Button */}
      <Button 
        onClick={onNewConversation}
        className="mx-4 my-3 flex items-center justify-center gap-2 p-2 rounded-md bg-[#6B5CA5] text-white hover:bg-[#5d4f91] transition-colors"
      >
        <LucidePlus size={18} />
        <span>{t('newChat')}</span>
      </Button>
      
      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          {t('recentConversationsHeader')}
        </div>
        <div className="space-y-1 px-2">
          {conversations.map((conversation) => (
            <button
              key={String(conversation.id)}
              onClick={() => onSelectConversation(conversation.id)}
              className={`w-full text-left rtl:text-right p-2 rounded-md flex items-start gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                conversation.active ? 'bg-gray-100 dark:bg-gray-700' : ''
              }`}
            >
              <LucideMessageSquare size={18} className="mt-0.5 text-[#6B5CA5]" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{conversation.title}</div>
                {/* MODIFIED: Use 'created_at' and format it */}
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(conversation.created_at).toLocaleDateString(i18n.language, {
                        year: 'numeric', month: 'short', day: 'numeric'
                    })}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        {/* Language Selector */}
        {user?.role === 'admin' && (
          <Button
            variant="outline"
            onClick={onOpenAdmin}
            className="w-full flex items-center justify-start gap-2"
          >
            <LucideShield size={18} className="text-gray-500" />
            <span>{t('adminPanel')}</span>
          </Button>
        )}
        {/* Settings and Logout Buttons */}
        <Button
          variant="outline" 
          onClick={onOpenSettings}
          className="w-full flex items-center justify-start gap-2"
        >
          <LucideSettings size={18} className="text-gray-500" />
          <span>{t('settings')}</span>
        </Button>
        <Button 
          variant="outline"
          onClick={logout}
          className="w-full flex items-center justify-start gap-2"
        >
          <LucideLogOut size={18} className="text-gray-500" />
          <span>{t('logoutButton')}</span>
        </Button>
      </div>
    </div>
  );
};

export default ChatSidebar;