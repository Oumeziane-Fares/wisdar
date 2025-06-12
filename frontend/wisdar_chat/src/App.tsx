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

  // This function remains largely the same, it's for loading historical data.
  const handleSelectConversation = useCallback(async (id: string | number) => {
    setConversations(prev => {
      const targetConversation = prev.find(c => c.id === id);
      if (!targetConversation) {
        console.error("Selected conversation not found");
        return prev;
      }
      setGlobalSelectedAiModel(targetConversation.aiModelId);
      return prev.map(c => ({ ...c, active: c.id === id }));
    });

    if (id !== 'new') {
      try {
        const response = await authFetch(`${import.meta.env.VITE_API_URL}/api/conversations/${id}/messages`);
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

  // *** THIS SSE LISTENER IS CORRECT AND HANDLES REAL-TIME UPDATES ***
// *** YOUR SSE useEffect HOOK ***
useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const eventSource = new EventSource(
        `${import.meta.env.VITE_API_URL}/api/stream/events?token=${token}`
    );

    eventSource.onopen = () => {
        console.log("--- FRONTEND: SSE Connection Opened Successfully! ---");
    };

    eventSource.addEventListener('new_message', (event) => {
        console.log("--- FRONTEND: 'new_message' event received! ---");
        
        try {
            const newMessage: Message = JSON.parse(event.data);
            console.log("Parsed newMessage object:", newMessage);

            setConversations(prevConvos => {
                console.log("Attempting to update state. Current conversations:", prevConvos);
                let matchFound = false;

                const updatedConvos = prevConvos.map(convo => {
                    // This log will tell us exactly what is being compared.
                    console.log(`COMPARING: convo.id (${typeof convo.id}: ${convo.id}) vs. newMessage.conversation_id (${typeof newMessage.conversation_id}: ${newMessage.conversation_id})`);
                    
                    if (String(convo.id) === String(newMessage.conversation_id)) {
                        matchFound = true;
                        console.log(`SUCCESS: Match found! Updating conversation: "${convo.title}"`);
                        return {
                            ...convo,
                            messages: [...convo.messages, newMessage]
                        };
                    }
                    return convo;
                });

                if (!matchFound) {
                    console.error("UI RENDER BLOCKED: No matching conversation was found in the React state. The UI will not update.");
                }
                
                return updatedConvos;
            });
        } catch (error) {
            console.error("FRONTEND: Failed to parse message from server:", error);
        }
    });

    eventSource.onerror = (err) => {
        console.error("--- FRONTEND: SSE Connection Error! ---", err);
        eventSource.close();
    };

    return () => {
        eventSource.close();
    };
}, [isAuthenticated]);


  // This effect for setting up user data is also correct.
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
          const response = await authFetch(`${import.meta.env.VITE_API_URL}/api/conversations`);
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
            
            await handleSelectConversation(conversationsWithState[0].id);
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
  }, [isAuthenticated, user, i18n.language, t, handleSelectConversation]);

  useEffect(() => {
    document.title = t('appTitle');
  }, [t]);

  const activeConversation = conversations.find(conv => conv.active) || null;
  
  const handleNewConversation = () => {
    if (conversations.some(c => c.id === 'new')) return;
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
  
  // --- THIS IS THE CORRECTED AND SIMPLIFIED FUNCTION ---
  const handleSendMessage = async (content: string, attachments?: File[]) => {
    if (!activeConversation) return;

    // 1. Optimistic UI update for the user's message
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

    // 2. Prepare data to send to the backend
    const isNewConversation = activeConversation.id === 'new';
    const endpoint = isNewConversation ? '/api/conversations/initiate' : '/api/messages';
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

        // 3. Process the backend response
        // The assistant_message will only be present for immediate (non-audio) responses.
        // For audio, it will be null, and the final message will arrive via the SSE listener.
        const { new_conversation, user_message, assistant_message } = await response.json();

        if (isNewConversation) {
            // New conversation was created. Replace the temporary one with the real one.
            const finalMessages = [user_message];
            if (assistant_message) {
                finalMessages.push(assistant_message);
            }

            const finalNewConversation: Conversation = {
                id: new_conversation.id,
                title: new_conversation.title,
                created_at: new_conversation.created_at,
                aiModelId: new_conversation.ai_model_id,
                messages: finalMessages,
                active: true,
            };

            setConversations(prev => [
                finalNewConversation,
                ...prev.filter(c => c.id !== 'new').map(c => ({ ...c, active: false }))
            ]);

        } else {
            // Added a message to an existing conversation.
            setConversations(prev => prev.map(c => {
                if (c.id === activeConversation.id) {
                    // Replace the optimistic message with the final one from the server.
                    const updatedMessages = c.messages.filter(m => m.id !== optimisticMessage.id);
                    updatedMessages.push(user_message);
                    
                    // If the assistant replied immediately, add its message.
                    // The SSE listener will handle cases where this isn't present.
                    if (assistant_message) {
                        updatedMessages.push(assistant_message);
                    }
                    
                    return { ...c, messages: updatedMessages };
                }
                return c;
            }));
        }
    } catch (error) {
        console.error("Error sending message:", error);
        // On error, remove the optimistic message to avoid confusion.
        setConversations(prev => prev.map(c => 
            c.id === activeConversation.id ? { ...c, messages: c.messages.filter(m => m.id !== optimisticMessage.id) } : c
        ));
    }
  };

  const handleAiModelChange = (newModelId: string) => {
    setGlobalSelectedAiModel(newModelId);
    
    if (activeConversation && (activeConversation.id === 'new' || activeConversation.messages.length === 0)) {
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