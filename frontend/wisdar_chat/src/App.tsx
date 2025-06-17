// frontend/wisdar_chat/src/App.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from './components/ui/ThemeProvider';
import ChatSidebar from './components/chat/ChatSidebar';
import ChatArea from './components/chat/ChatArea';
import SettingsPanel from './components/settings/SettingsPanel';
import AdminDashboard from './components/admin/AdminDashboard';
import AuthPage from './pages/AuthPage';
import { useAuth } from './contexts/AuthContext';
import { authFetch } from './lib/api';
import { AiModel, Conversation, Message, MessageStatus, User } from './types';
import './App.css';

type View = 'chat' | 'settings' | 'admin';

function App() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, user, logout } = useAuth();

  const [availableModels, setAvailableModels] = useState<AiModel[]>([]);
  const [globalSelectedAiModel, setGlobalSelectedAiModel] = useState<string>('');
  const [currentView, setCurrentView] = useState<View>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  const sseRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);

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
        // CORRECTED: Removed VITE_API_URL and used the correct relative path.
        const response = await authFetch(`/chat/conversations/${id}/messages`);
        if (!response.ok) throw new Error('Failed to fetch messages.');
        const messagesData: Message[] = await response.json();
        
        setConversations(prev => prev.map(c => 
          c.id === id ? { 
            ...c, 
            messages: messagesData.map(m => ({
              ...m, 
              status: 'complete' as MessageStatus
            })) 
          } : c
        ));
      } catch (error) {
        console.error(`Error fetching messages for conversation ${id}:`, error);
      }
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    const setupSSEConnection = () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
      
      // CORRECTED: Removed VITE_API_URL. EventSource works with a relative path.
      // The Vite proxy will handle forwarding this to the backend.
      sseRef.current = new EventSource(
        `/api/stream/events`,
        { withCredentials: true }
      );
      
      const eventSource = sseRef.current;
      
      eventSource.onopen = () => {
        console.log("SSE Connection Established");
        reconnectAttempts.current = 0;
      };

      eventSource.addEventListener('ping', () => {});

      eventSource.addEventListener('transcription_complete', (event: MessageEvent) => {
        try {
          const eventData = JSON.parse(event.data);
          console.log("transcription_complete event:", eventData);
          
          setConversations(prev => prev.map(convo => {
            const userMessageIndex = convo.messages.findIndex(m => m.id === eventData.message_id);
            if (userMessageIndex !== -1) {
              const updatedUserMessage = {
                ...convo.messages[userMessageIndex],
                content: eventData.content,
                status: 'complete' as MessageStatus
              };

              const assistantMessageIndex = convo.messages.findIndex(m => 
                m.id === `assistant-${eventData.message_id}`
              );
              
              const newMessages = [...convo.messages];
              newMessages[userMessageIndex] = updatedUserMessage;
              
              if (assistantMessageIndex !== -1) {
                newMessages[assistantMessageIndex] = {
                  ...newMessages[assistantMessageIndex],
                  status: 'thinking' as MessageStatus
                };
              }

              return { ...convo, messages: newMessages };
            }
            return convo;
          }));
        } catch (error) {
          console.error("Error handling transcription_complete:", error);
        }
      });

      eventSource.addEventListener('stream_start', (event: MessageEvent) => {
        try {
          const eventData = JSON.parse(event.data);
          console.log("stream_start event:", eventData);
          
          const newMessage: Message = eventData.message;
          setConversations(prev => prev.map(convo => {
            if (String(convo.id) === String(newMessage.conversation_id)) {
              const placeholderIndex = convo.messages.findIndex(m => 
                m.status === 'thinking' || m.status === 'transcribing'
              );
              
              if (placeholderIndex !== -1) {
                const newMessages = [...convo.messages];
                newMessages.splice(placeholderIndex, 1, {
                  ...newMessage,
                  status: 'streaming' as MessageStatus
                });
                
                return {
                  ...convo,
                  messages: newMessages
                };
              }
              
              return {
                ...convo,
                messages: [...convo.messages, {
                  ...newMessage,
                  status: 'streaming' as MessageStatus
                }]
              };
            }
            return convo;
          }));
        } catch (error) {
          console.error("Error handling stream_start:", error);
        }
      });

      eventSource.addEventListener('stream_chunk', (event: MessageEvent) => {
        try {
          const eventData = JSON.parse(event.data);
          setConversations(prev => prev.map(convo => {
            const messageIndex = convo.messages.findIndex(m => 
              m.id === eventData.message_id
            );
            
            if (messageIndex !== -1) {
              const updatedMessages = [...convo.messages];
              updatedMessages[messageIndex] = {
                ...updatedMessages[messageIndex],
                content: updatedMessages[messageIndex].content + eventData.content,
              };
              return { ...convo, messages: updatedMessages };
            }
            return convo;
          }));
        } catch (error) {
          console.error("Error handling stream_chunk:", error);
        }
      });

      eventSource.addEventListener('stream_end', (event: MessageEvent) => {
        try {
          const eventData = JSON.parse(event.data);
          console.log("stream_end event:", eventData);
          
          setConversations(prev => prev.map(convo => {
            const messageIndex = convo.messages.findIndex(m => 
              m.id === eventData.message_id
            );
            
            if (messageIndex !== -1) {
              const updatedMessages = [...convo.messages];
              updatedMessages[messageIndex] = {
                ...updatedMessages[messageIndex],
                status: 'complete' as MessageStatus
              };
              return { ...convo, messages: updatedMessages };
            }
            return convo;
          }));
        } catch (error) {
          console.error("Error handling stream_end:", error);
        }
      });

      eventSource.onerror = (err) => {
        console.error("SSE Connection Error:", err);
        eventSource.close();
        
        if (reconnectAttempts.current < 5) {
          const delay = Math.min(3000 * (reconnectAttempts.current + 1), 15000);
          reconnectAttempts.current += 1;
          
          setTimeout(() => {
            console.log(`Attempting SSE reconnect (#${reconnectAttempts.current})...`);
            setupSSEConnection();
          }, delay);
        } else {
          console.error("Max SSE reconnect attempts reached");
        }
      };
    };

    setupSSEConnection();
    
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [isAuthenticated]);

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
          // CORRECTED: Removed VITE_API_URL and used the correct relative path.
          const response = await authFetch('/chat/conversations');
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
  
  const handleSendMessage = async (content: string, attachments?: File[]) => {
    if (!activeConversation) return;

    const hasAttachment = attachments && attachments.length > 0;
    const userMessageId = `temp-user-${Date.now()}`;

    const optimisticUserMessage: Message = {
      id: userMessageId,
      content: content,
      role: 'user',
      timestamp: new Date().toISOString(),
      status: 'complete',
      attachment: hasAttachment ? { 
          fileName: attachments![0].name, 
          fileType: attachments![0].type, 
          fileURL: URL.createObjectURL(attachments![0])
      } : undefined
    };

    const optimisticAssistantMessage: Message = {
      id: `assistant-${userMessageId}`,
      content: '',
      role: 'assistant',
      timestamp: new Date().toISOString(),
      status: hasAttachment ? 'transcribing' : 'thinking' as MessageStatus
    };
    
    setConversations(prev => prev.map(c => 
      c.id === activeConversation.id ? { 
        ...c, 
        messages: [...c.messages, optimisticUserMessage, optimisticAssistantMessage] 
      } : c
    ));

    const isNewConversation = activeConversation.id === 'new';
    // CORRECTED: Use a consistent endpoint pattern
    const endpoint = isNewConversation 
      ? '/chat/conversations/initiate' 
      : `/chat/conversations/${activeConversation.id}/messages`;
    
    const formData = new FormData();
    formData.append('content', content);

    if (isNewConversation) {
        formData.append('ai_model_id', activeConversation.aiModelId);
    }
    
    if (hasAttachment) {
        formData.append('attachment', attachments![0]);
    }

    try {
        // CORRECTED: Call fetch directly for multipart/form-data.
        // Bypassing authFetch here because it's configured for JSON.
        const response = await fetch(`/api${endpoint}`, {
            method: 'POST',
            body: formData,
            credentials: 'include', // Don't forget credentials for cookies
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'API request failed.' }));
            throw new Error(errorData.message);
        }

        const { new_conversation, user_message } = await response.json();

        if (isNewConversation) {
            const finalNewConversation: Conversation = {
                id: new_conversation.id,
                title: new_conversation.title,
                created_at: new_conversation.created_at,
                aiModelId: new_conversation.ai_model_id,
                messages: conversations.find(c => c.id === 'new')?.messages || [],
                active: true,
            };

            setConversations(prev => [
                finalNewConversation,
                ...prev.filter(c => c.id !== 'new').map(c => ({ ...c, active: false }))
            ]);
        } else {
            setConversations(prev => prev.map(c => {
                if (c.id === activeConversation.id) {
                    const updatedMessages = c.messages.map(m => 
                        m.id === optimisticUserMessage.id ? { 
                            ...user_message, 
                            status: 'complete' as MessageStatus 
                        } : m
                    );
                    return { ...c, messages: updatedMessages };
                }
                return c;
            }));
        }
    } catch (error) {
        console.error("Error sending message:", error);
        setConversations(prev => prev.map(c => 
            c.id === activeConversation.id ? { 
                ...c, 
                messages: c.messages.filter(m => 
                    m.id !== optimisticUserMessage.id && 
                    m.id !== optimisticAssistantMessage.id
                ) 
            } : c
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

  const handleLogout = () => {
    logout();
    setConversations([]);
    setAvailableModels([]);
    setGlobalSelectedAiModel('');
  };

  if (!isAuthenticated) {
    return ( 
      <ThemeProvider> 
        <AuthPage /> 
      </ThemeProvider> 
    );
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
              onLogout={handleLogout}
            />
            {activeConversation ? (
              <div className="flex-1 flex flex-col">
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
        
        {currentView === 'settings' && ( 
          <SettingsPanel 
            onBack={() => setCurrentView('chat')} 
          /> 
        )}
        
        {currentView === 'admin' && user?.role === 'admin' && ( 
          <AdminDashboard 
            onBack={() => setCurrentView('chat')} 
          /> 
        )}
        
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
