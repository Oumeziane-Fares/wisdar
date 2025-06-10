import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from './components/ui/ThemeProvider';
import ChatSidebar from './components/chat/ChatSidebar';
import ChatArea from './components/chat/ChatArea';
import SettingsPanel from './components/settings/SettingsPanel';
import AdminDashboard from './components/admin/AdminDashboard';
import AuthPage from './pages/AuthPage'; 
import { useAuth } from './contexts/AuthContext'; 
import { authFetch } from './lib/api';
import { AiModel, Conversation, Message, User } from './types'; 
import './App.css';

type View = 'chat' | 'settings' | 'admin';

function App() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, user } = useAuth(); 

  const [availableModels, setAvailableModels] = useState<AiModel[]>([]);
  const [globalSelectedAiModel, setGlobalSelectedAiModel] = useState<string>('');
  const [currentView, setCurrentView] = useState<View>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const handleSelectConversation = useCallback(async (id: string | number) => {
    setConversations(prev => {
      const targetConversation = prev.find(c => c.id === id);
      
      if (!targetConversation) {
        console.error("Selected conversation not found");
        return prev;
      }

      // 1. Set global model based on clicked conversation
      setGlobalSelectedAiModel(targetConversation.aiModelId);

      // 2. Mark clicked conversation as active
      return prev.map(c => ({ ...c, active: c.id === id }));
    });

    // 3. Fetch messages after state update
    if (id !== 'new') {
      try {
        const response = await authFetch(`${import.meta.env.VITE_API_URL}/conversations/${id}/messages`);
        if (!response.ok) throw new Error('Failed to fetch messages.');
        const messagesData: Message[] = await response.json();
        
        setConversations(prev => prev.map(c => 
          c.id === id ? { ...c, messages: messagesData } : c
        ));
      } catch (error) {
        console.error(`Error fetching messages for conversation ${id}:`, error);
      }
    }
  }, []);

  useEffect(() => {
    const setupUserData = async () => {
      setIsLoading(true);
      if (isAuthenticated && user) {
        const userModels = (user.assigned_models || []).map(model => ({
          ...model,
          name: t(`model.${model.id.replace(/-/g, '')}`, model.display_name)
        }));
        setAvailableModels(userModels);

        try {
          const response = await authFetch(`${import.meta.env.VITE_API_URL}/conversations`);
          if (!response.ok) throw new Error('Failed to fetch conversations');
          const dataFromBackend = await response.json();
          
          const data: Conversation[] = dataFromBackend.map((conv: any) => ({
            id: conv.id,
            title: conv.title,
            created_at: conv.created_at,
            aiModelId: conv.ai_model_id,
            messages: [],
          }));
          
          if (data.length > 0) {
            const conversationsWithState = data.map((conv, index) => ({
                ...conv,
                active: index === 0
            }));
            
            setConversations(conversationsWithState);
            setGlobalSelectedAiModel(conversationsWithState[0].aiModelId);
            
            const firstId = conversationsWithState[0].id;
            try {
              const messagesResponse = await authFetch(`${import.meta.env.VITE_API_URL}/conversations/${firstId}/messages`);
              if (!messagesResponse.ok) throw new Error('Failed to fetch messages');
              const messagesData: Message[] = await messagesResponse.json();
              
              setConversations(prev => prev.map(c => 
                c.id === firstId ? { ...c, messages: messagesData } : c
              ));
            } catch (error) {
              console.error('Error loading first conversation messages:', error);
            }
          } else {
            setConversations([]);
            if (userModels.length > 0) {
              setGlobalSelectedAiModel(userModels[0].id);
            }
          }
        } catch (error) {
          console.error('An error occurred while fetching conversations:', error);
        }
      } else {
        setConversations([]);
        setAvailableModels([]);
        setGlobalSelectedAiModel('');
        setCurrentView('chat');
      }
      setIsLoading(false);
    };
    
    setupUserData();
  }, [isAuthenticated, user, i18n.language, t]);

  useEffect(() => {
    document.title = t('appTitle');
  }, [t]);

  const activeConversation = conversations.find(conv => conv.active) || null;
  
  const handleNewConversation = () => {
    const isAlreadyInNewChat = conversations.some(c => c.id === 'new');
    if (isAlreadyInNewChat) return;

    if (!globalSelectedAiModel) {
        alert(t('noModelsAssignedError'));
        return;
    }

    const newTempConvo: Conversation = {
      id: 'new',
      title: t('conversationTitleFallback'),
      created_at: new Date().toISOString(),
      messages: [],
      active: true,
      aiModelId: globalSelectedAiModel
    };

    setConversations(prev => [newTempConvo, ...prev.map(c => ({ ...c, active: false }))]);
  };
  
  const handleSendMessage = async (content: string, attachments?: File[]) => {
    if (!activeConversation) return;

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      content: content,
      role: 'user',
      timestamp: new Date().toISOString(),
      attachment: attachments?.[0] ? { 
          fileName: attachments[0].name, 
          fileType: attachments[0].type, 
          fileURL: URL.createObjectURL(attachments[0])
      } : undefined
    };
    setConversations(prev => prev.map(c => 
        c.id === activeConversation.id ? { ...c, messages: [...c.messages, optimisticMessage] } : c
    ));

    const isNewConversation = activeConversation.id === 'new';
    const endpoint = isNewConversation ? '/conversations/initiate' : '/messages';
    const formData = new FormData();
    formData.append('content', content);
    if (isNewConversation) {
        formData.append('ai_model_id', activeConversation.aiModelId);
    } else {
        formData.append('conversation_id', String(activeConversation.id));
    }
    if (attachments && attachments.length > 0) {
        formData.append('attachment', attachments[0]);
    }

    try {
        const response = await authFetch(`${import.meta.env.VITE_API_URL}${endpoint}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'API request failed.');
        }

        const { new_conversation, user_message, assistant_message } = await response.json();

        // --- MODIFIED LOGIC TO FIX THE BUG ---
        if (isNewConversation) {
            // This case handles creating a brand new conversation
            const finalNewConversation: Conversation = {
                id: new_conversation.id,
                title: new_conversation.title,
                created_at: new_conversation.created_at,
                aiModelId: new_conversation.ai_model_id,
                messages: [user_message, assistant_message],
                active: true, // Make it active immediately
            };

            setConversations(prev => {
                // Filter out the temporary 'new' convo and mark all others as inactive
                const otherConversations = prev
                    .filter(c => c.id !== 'new')
                    .map(c => ({ ...c, active: false }));
                
                // Add the new, real conversation to the top of the list
                return [finalNewConversation, ...otherConversations];
            });
        } else {
            // This case handles adding messages to an existing conversation
            setConversations(prev => prev.map(c => {
                if (c.id === activeConversation.id) {
                    // Replace the optimistic message with the real ones from the server
                    const updatedMessages = c.messages.filter(m => m.id !== optimisticMessage.id);
                    updatedMessages.push(user_message, assistant_message);
                    return { ...c, messages: updatedMessages };
                }
                return c; // Return other conversations unchanged
            }));
        }
        // --- END OF MODIFIED LOGIC ---

    } catch (error) {
        console.error("Error sending message:", error);
        // On error, remove the optimistic message
        setConversations(prev => prev.map(c => 
            c.id === activeConversation.id ? { ...c, messages: c.messages.filter(m => m.id !== optimisticMessage.id) } : c
        ));
    }
  };

  const handleAiModelChange = (newModelId: string) => {
    setGlobalSelectedAiModel(newModelId);
    
    if (activeConversation && 
        (activeConversation.id === 'new' || activeConversation.messages.length === 0)) {
      setConversations(prev => 
        prev.map(c => 
          c.id === activeConversation.id ? { ...c, aiModelId: newModelId } : c
        )
      );
    }
  };

  if (!isAuthenticated) {
    return ( <ThemeProvider> <AuthPage /> </ThemeProvider> );
  }
  
  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  
  return ( 
    <ThemeProvider>
      <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {currentView === 'chat' && (
          <div className="h-full flex">
            <ChatSidebar 
              conversations={conversations}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onOpenSettings={() => setCurrentView('settings')}
            />
            {activeConversation ? (
              <div className="flex-1">
                <ChatArea 
                  conversationTitle={activeConversation.title}
                  messages={activeConversation.messages || []}
                  onSendMessage={handleSendMessage}
                  availableModels={availableModels}
                  selectedModel={activeConversation.aiModelId}
                  onSelectModel={handleAiModelChange}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500">{t('noActiveConversation')}</p>
              </div>
            )}
          </div>
        )}
        
        {currentView === 'settings' && ( <SettingsPanel onBack={() => setCurrentView('chat')} /> )}
        {currentView === 'admin' && user?.role === 'admin' && ( <AdminDashboard /> )}
        
        {user?.role === 'admin' && currentView !== 'admin' && (
          <button 
            onClick={() => setCurrentView('admin')}
            className="fixed bottom-4 right-4 rtl:left-4 rtl:right-auto p-2 bg-[#6B5CA5] text-white rounded-md"
          >
            {t('adminPanelAccessButton')}
          </button>
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
