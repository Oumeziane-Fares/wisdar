import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  LucideMessageSquare, 
  LucidePlus, 
  LucideSettings, 
  LucideLogOut, 
  LucideShield, 
  CircleDollarSign,
  MoreHorizontal,
  FilePenLine,
  Pin,
  Trash2,
  Zap,
  Sparkles,
  BookOpen,
  LucideUsers,
  Bot,
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from '../../contexts/AuthContext';
import { Agent, Conversation } from '../../types';
import { useConversationStore } from '../../store/conversationStore';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  deleteConversation as apiDeleteConversation, 
  renameConversation as apiRenameConversation,
  togglePinConversation as apiTogglePin 
} from '../../lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { authFetch } from '../../lib/api'; // NEW import

// --- NEW: Import Dialog components instead of Popover ---
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"; // For the agent gallery


interface ChatSidebarProps {
  conversations: Conversation[];
  onSelectConversation: (id: string | number) => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onOpenTeam: () => void;
  onLogout: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  conversations,
  onSelectConversation,
  onNewConversation,
  onOpenSettings,
  onOpenAdmin,
  onOpenTeam, // --- NEW: Destructure prop ---
  onLogout,
}) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { userCredits, removeConversation, updateConversationTitle, pinConversation, createAgentConversation  } = useConversationStore();

  const [renamingId, setRenamingId] = useState<string | number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  // --- NEW: State to control the Dialog's visibility ---
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

    // --- NEW: State and fetcher for agents ---
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await authFetch('/agents');
        if (!res.ok) throw new Error("Could not fetch agents");
        setAgents(await res.json());
      } catch (e) {
        console.error("Failed to fetch agents", e);
        toast.error("Could not load AI agents.");
      }
    };
    fetchAgents();
  }, []);
    const handleSelectAgent = (agent: Agent) => {
      createAgentConversation(agent);
      setIsAgentDialogOpen(false); // Close the dialog after selection
  };

  useEffect(() => {
    if (renamingId !== null && renameInputRef.current) {
        renameInputRef.current.focus();
        renameInputRef.current.select();
    }
  }, [renamingId]);

  // --- NEW: Helper function to get the correct icon for each AI provider ---
  const getProviderIcon = (providerId?: string) => {
    switch (providerId) {
      case 'openai':
        return <Zap size={18} className="mt-0.5 text-green-500 flex-shrink-0" />;
      case 'google':
        return <Sparkles size={18} className="mt-0.5 text-blue-500 flex-shrink-0" />;
      case 'anthropic':
        return <BookOpen size={18} className="mt-0.5 text-orange-500 flex-shrink-0" />;
      default:
        // Fallback for older conversations that might not have a providerId
        return <LucideMessageSquare size={18} className="mt-0.5 text-[#6B5CA5] flex-shrink-0" />;
    }
  };


  // --- Event Handlers for Conversation Actions ---

  const handlePin = async (e: React.MouseEvent, id: string | number) => {
    e.stopPropagation();
    try {
      pinConversation(id); // Optimistic UI update for instant reordering
      await apiTogglePin(id); // Sync with backend
      toast.success(t('pinStatusChanged', 'Pin status updated.'));
    } catch (error) {
      console.error("Failed to update pin status:", error);
      toast.error(t('pinFailed', 'Failed to update pin status.'));
      pinConversation(id); // Revert UI on failure
    }
  };

  const handleRename = (e: React.MouseEvent, conversation: Conversation) => {
    e.stopPropagation();
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
  };

  const submitRename = async (conversationId: string | number) => {
    if (!renameValue.trim() || !renamingId) {
        setRenamingId(null);
        return;
    };
    const originalTitle = conversations.find(c => c.id === conversationId)?.title || '';
    if (renameValue.trim() === originalTitle) {
        setRenamingId(null);
        return;
    }
    try {
        const updatedConversation = await apiRenameConversation(conversationId, renameValue);
        updateConversationTitle(conversationId, updatedConversation.title);
        toast.success(t('conversationRenamed', 'Conversation renamed.'));
    } catch (error) {
        console.error("Failed to rename conversation:", error);
        toast.error(t('renameFailed', 'Failed to rename conversation.'));
    } finally {
        setRenamingId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string | number) => {
    e.stopPropagation();
    if (window.confirm(t('deleteConfirmation', 'Are you sure you want to delete this conversation?'))) {
      try {
        await apiDeleteConversation(id);
        toast.success(t('conversationDeleted', 'Conversation deleted.'));
        // With Framer Motion, we just need to remove it from the store. 
        // The AnimatePresence component will handle the exit animation automatically.
        removeConversation(id);
      } catch (error) {
        console.error("Failed to delete conversation:", error);
        toast.error(t('deleteFailed', 'Failed to delete conversation.'));
      }
    }
  };

  return (
    <>
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
        <div className="px-2">
          <AnimatePresence>
            {conversations.map((conversation) => (
              <motion.div
                layout
                animate={{ opacity: 1, height: 'auto', marginBottom: '4px' }}
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{
                  layout: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
                  opacity: { duration: 0.2 },
                }}
                key={String(conversation.id)}
                className={`group w-full text-left rtl:text-right rounded-md flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  conversation.active ? 'bg-gray-100 dark:bg-gray-700' : ''
                }`}
              >
                <button onClick={() => renamingId !== conversation.id && onSelectConversation(conversation.id)} className="flex-1 flex items-start gap-2 p-2 min-w-0">
                  {/* --- UPDATED: Use the helper function to display the correct provider icon --- */}
                  {getProviderIcon(conversation.providerId)}
                  <div className="flex-1 min-w-0">
                    {renamingId === conversation.id ? (
                        <Input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => submitRename(conversation.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') submitRename(conversation.id);
                                if (e.key === 'Escape') setRenamingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-6 text-sm"
                        />
                    ) : (
                        <div className="font-medium truncate flex items-center">
                          {conversation.is_pinned && <Pin size={12} className="mr-1.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />}
                          {conversation.title}
                        </div>
                    )}
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(conversation.created_at).toLocaleDateString(i18n.language, {
                            year: 'numeric', month: 'short', day: 'numeric'
                        })}
                    </div>
                  </div>
                </button>

                {renamingId !== conversation.id && (
                  <div className="pr-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => handlePin(e, conversation.id)}>
                          <Pin className="mr-2 h-4 w-4" />
                          <span>{conversation.is_pinned ? t('unpinConversation', 'Unpin') : t('pinConversation', 'Pin')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleRename(e, conversation)}>
                          <FilePenLine className="mr-2 h-4 w-4" />
                          <span>{t('renameConversation', 'Rename')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => handleDelete(e, conversation.id)} className="text-red-500 hover:!text-red-500 focus:text-red-500">
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>{t('deleteConversation', 'Delete')}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
      
      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger className="w-full">
                <div className="w-full flex items-center justify-start gap-2 p-2 rounded-md bg-gray-50 dark:bg-gray-700/50">
                    <CircleDollarSign size={18} className="text-green-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('credits')}:</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white ml-auto">
                        {Math.floor(userCredits).toLocaleString()}
                    </span>
                </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>You have {userCredits.toLocaleString()} credits remaining.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
                {/* --- NEW PLACEMENT: The Agents button is now here, matching the other buttons --- */}
        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setIsAgentDialogOpen(true)}>
          <Bot className="h-4 w-4" />
          <span>AI Agents</span>
        </Button>
        {/* --- NEW: Add this button for Team Admins --- */}
        {user?.role === 'team_admin' && (
          <Button variant="outline" onClick={onOpenTeam} className="w-full flex items-center justify-start gap-2">
            <LucideUsers size={18} className="text-gray-500" />
            <span>{t('team.manageTitle', 'Manage Team')}</span>
          </Button>
        )}
        {user?.role === 'admin' && (
          <Button variant="outline" onClick={onOpenAdmin} className="w-full flex items-center justify-start gap-2">
            <LucideShield size={18} className="text-gray-500" />
            <span>{t('adminPanel')}</span>
          </Button>
        )}
        <Button variant="outline" onClick={onOpenSettings} className="w-full flex items-center justify-start gap-2">
          <LucideSettings size={18} className="text-gray-500" />
          <span>{t('settings')}</span>
        </Button>
        <Button variant="outline" onClick={onLogout} className="w-full flex items-center justify-start gap-2">
          <LucideLogOut size={18} className="text-gray-500" />
          <span>{t('logoutButton')}</span>
        </Button>
      </div>
    </div>
          <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select an AI Agent</DialogTitle>
            <DialogDescription>Choose a specialized agent for your task.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-4 max-h-[60vh] overflow-y-auto">
            {agents.map(agent => (
              <Card 
                key={agent.id} 
                className="cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => handleSelectAgent(agent)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-md">
                    <Bot size={18} /> {agent.name}
                  </CardTitle>
                  <CardDescription className="text-xs">{agent.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
       </>
  );
};

export default ChatSidebar;