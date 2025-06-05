// frontend/wisdar_chat/src/components/chat/ChatSidebar.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { LucideMessageSquare, LucidePlus, LucideSearch, LucideSettings, LucideLogOut } from 'lucide-react'; // Add LucideLogOut
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; //
import { Label } from "@/components/ui/label"; //
import { Button } from "@/components/ui/button"; //
import { useAuth } from '../../contexts/AuthContext'; // Import useAuth

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
  // onLogout is no longer passed as a prop, useAuth will be used directly
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  conversations,
  onSelectConversation,
  onNewConversation,
  onOpenSettings
}) => {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth(); // Get user and logout from AuthContext

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const currentLanguage = i18n.language;

  return (
    <div className="w-64 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header with logo and User Info */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
            <img 
              src="/images/logo-wisdar.png" 
              alt="Wisdar" 
              className="h-8" 
            />
            {user && <span className="text-sm text-gray-600 dark:text-gray-300">{user.username} ({user.role})</span>}
        </div>
      </div>
      
      <button 
        onClick={onNewConversation}
        className="mx-4 my-3 flex items-center justify-center gap-2 p-2 rounded-md bg-[#6B5CA5] text-white hover:bg-[#5d4f91] transition-colors"
      >
        <LucidePlus size={18} />
        <span>{t('newChat')}</span>
      </button>
      
      <div className="px-4 pb-2">
        <div className="relative">
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            className="w-full p-2 pl-8 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-[#6B5CA5] dark:text-white"
          />
          <LucideSearch size={16} className="absolute left-2 rtl:right-2 rtl:left-auto top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          {t('recentConversationsHeader')}
        </div>
        <div className="space-y-1 px-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
              className={`w-full text-left rtl:text-right p-2 rounded-md flex items-start gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
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
      
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <div className="space-y-1">
            <Label htmlFor="language-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
             {t('languageLabel')}
            </Label>
            <Select value={currentLanguage} onValueChange={changeLanguage}>
              <SelectTrigger id="language-select" className="w-full dark:bg-gray-700 dark:text-white">
                <SelectValue placeholder={t('languageLabel')} />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-700">
                <SelectItem value="en" className="dark:text-white dark:focus:bg-gray-600">{t('english')}</SelectItem>
                <SelectItem value="ar" className="dark:text-white dark:focus:bg-gray-600">{t('arabic')}</SelectItem>
              </SelectContent>
            </Select>
        </div>

        <Button
          variant="outline" 
          onClick={onOpenSettings}
          className="w-full flex items-center justify-start gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white dark:border-gray-600"
        >
          <LucideSettings size={18} className="text-gray-500 dark:text-gray-400" />
          <span>{t('settings')}</span>
        </Button>

        <Button 
          variant="outline"
          onClick={logout} // Use logout from AuthContext
          className="w-full flex items-center justify-start gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white dark:border-gray-600"
        >
          <LucideLogOut size={18} className="text-gray-500 dark:text-gray-400" />
          <span>{t('logoutButton')}</span>
        </Button>
      </div>
    </div>
  );
};

export default ChatSidebar;