// frontend/wisdar_chat/src/App.tsx

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from './components/ui/ThemeProvider';
import ChatSidebar from './components/chat/ChatSidebar';
import ChatArea from './components/chat/ChatArea';
import SettingsPanel from './components/settings/SettingsPanel';
import AdminDashboard from './components/admin/AdminDashboard';
import AuthPage from './pages/AuthPage';
import { useAuth } from './contexts/AuthContext';
import { authFetch } from './lib/api';
import { AiModel, Conversation, Message, MessageStatus } from './types';
import { toast } from "sonner";
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
  //const reconnectAttempts = useRef(0);
  //const lastChunkUpdate = useRef(0); // For throttling rapid events

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
            // Close any existing connection before creating a new one
            if (sseRef.current) {
                sseRef.current.close();
            }
            
            // Create the new EventSource connection
            sseRef.current = new EventSource(`/api/stream/events`, { withCredentials: true });
            const eventSource = sseRef.current;
            
            // Log when the connection is successfully opened
            eventSource.onopen = () => console.log("%cSSE Connection Established", "color: green; font-weight: bold;");

            // Use a single onmessage handler to process all incoming events
            eventSource.onmessage = (event: MessageEvent) => {
                try {
                    console.log("[Raw SSE Event]", event.data);
                    
                    // --- THE DEFINITIVE FIX ---
                    // 1. Parse the outer JSON from the SSE `data` field.
                    const outerData = JSON.parse(event.data);
                    
                    // 2. The actual event payload is a JSON *string* inside the 'data' property. Parse it too.
                    const eventData = JSON.parse(outerData.data);
                    
                    console.log(`%c[SSE Parsed] Type: ${eventData.type}`, "color: purple;", eventData);

                    // --- Handle the different event types ---

                    if (eventData.type === 'stream_start') {
                        const newMessage: Message = eventData.message;
                        // Guard against missing conversation_id to ensure type safety
                        if (typeof newMessage.conversation_id === 'undefined') {
                            console.error("stream_start event received without a conversation_id.");
                            return;
                        }

                        const realConversationId = newMessage.conversation_id;

                        setConversations(prev => {
                            const newConvos = [...prev];
                            const convoIndex = newConvos.findIndex(c => c.id === 'new' || c.id === realConversationId);
                            if (convoIndex === -1) return prev;
                            
                            const updatedConvo = { ...newConvos[convoIndex] };
                            updatedConvo.id = realConversationId; // Solidify the conversation ID
                            
                            const placeholderIndex = updatedConvo.messages.findIndex(m => m.status === 'thinking' || m.status === 'transcribing');

                            if (placeholderIndex !== -1) {
                                // Replace the placeholder with the real streaming message
                                updatedConvo.messages[placeholderIndex] = { ...newMessage, status: 'streaming' };
                            } else {
                                updatedConvo.messages.push({ ...newMessage, status: 'streaming' });
                            }
                            
                            newConvos[convoIndex] = updatedConvo;
                            return newConvos;
                        });

                    } else if (eventData.type === 'stream_chunk') {
                        setConversations(prev => prev.map(convo => {
                            const msgIndex = convo.messages.findIndex(m => m.status === 'streaming');
                            if (msgIndex === -1) return convo;

                            // Create a new, updated message object immutably
                            const updatedMessage = {
                                ...convo.messages[msgIndex],
                                content: convo.messages[msgIndex].content + eventData.content
                            };

                            const newMessages = [...convo.messages];
                            newMessages[msgIndex] = updatedMessage;
                            
                            return { ...convo, messages: newMessages };
                        }));
                        
                    } else if (eventData.type === 'stream_end') {
                        setConversations(prev => prev.map(convo => {
                            const msgIndex = convo.messages.findIndex(m => m.id === eventData.message_id);
                            if (msgIndex === -1) return convo;
                            
                            const newMessages = [...convo.messages];
                            newMessages[msgIndex] = { ...newMessages[msgIndex], status: 'complete' };

                            return { ...convo, messages: newMessages };
                        }));
                    }

                } catch (error) {
                    console.error("Error processing SSE message:", error);
                }
            };

            eventSource.onerror = (err) => {
                console.error("%cSSE Connection Error", "color: red; font-weight: bold;", err);
                eventSource.close();
                // Your reconnect logic can go here if needed
            };
        };

        setupSSEConnection();
        
        // Cleanup function to close the connection when the component unmounts
        return () => {
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }
        };
    }, [isAuthenticated]); // This effect should only re-run when authentication status changes

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
    const assistantMessageId = `assistant-${userMessageId}`;

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
      id: assistantMessageId,
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
      const response = await fetch(`/api${endpoint}`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
      });

      if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'API request failed.' }));
          throw new Error(errorData.message);
      }

      const { new_conversation, user_message } = await response.json();

      if (isNewConversation) {
        setConversations(prev => {
            const tempConvo = prev.find(c => c.id === 'new');
            const optimisticMessages = tempConvo ? tempConvo.messages : [];
            
            // Create synchronized message list
            const finalMessages = optimisticMessages.map(m => {
                if (m.id === userMessageId) {
                    return { ...user_message, status: 'complete' as MessageStatus };
                }
                return m;
            });

            const finalNewConversation: Conversation = {
                id: new_conversation.id,
                title: new_conversation.title,
                created_at: new_conversation.created_at,
                aiModelId: new_conversation.ai_model_id,
                messages: finalMessages,
                active: true,
            };

            return [
                finalNewConversation,
                ...prev.filter(c => c.id !== 'new').map(c => ({ ...c, active: false }))
            ];
        });
      } else {
        setConversations(prev => prev.map(c => {
          if (c.id === activeConversation.id) {
            const updatedMessages = c.messages.map(m => 
              m.id === userMessageId ? { ...user_message, status: 'complete' as MessageStatus } : m
            );
            return { ...c, messages: updatedMessages };
          }
          return c;
        }));
      }
    } catch (error) {
      console.error("Error sending message:", error);
        toast.error("Failed to send message", {
          description: "Please check your network connection and try again.",
        });
      setConversations(prev => prev.map(c => 
        c.id === activeConversation.id ? { 
          ...c, 
          messages: c.messages.filter(m => 
            m.id !== userMessageId && 
            m.id !== assistantMessageId
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