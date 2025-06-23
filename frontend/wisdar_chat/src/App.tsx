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
import { useConversationStore } from './store/conversationStore';

type View = 'chat' | 'settings' | 'admin';

function App() {
    const { t, i18n } = useTranslation();
    const { isAuthenticated, user, logout } = useAuth();

    // Get state and all actions from the Zustand store
    const { 
        conversations, 
        setConversations: setStoreConversations,
        addOptimisticMessages,
        syncRealMessage,
        removeOptimisticMessagesOnError,
        startStreaming,
        appendStreamChunk,
        endStreaming,
        handleFailedTask
    } = useConversationStore();

    // Component-level state remains for UI concerns not related to chat data
    const [availableModels, setAvailableModels] = useState<AiModel[]>([]);
    const [globalSelectedAiModel, setGlobalSelectedAiModel] = useState<string>('');
    const [currentView, setCurrentView] = useState<View>('chat');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    
    const sseRef = useRef<EventSource | null>(null);

    // This SSE handler is now extremely simple. It just calls the store's actions.
    useEffect(() => {
        if (!isAuthenticated) return;
        
        const setupSSEConnection = () => {
            if (sseRef.current) sseRef.current.close();
            
            sseRef.current = new EventSource(`/api/stream/events`, { withCredentials: true });
            const eventSource = sseRef.current;
            
            eventSource.onopen = () => console.log("SSE Connection Established");

          eventSource.onmessage = (event: MessageEvent) => {
              try {
                  const outerData = JSON.parse(event.data);
                  const eventData = typeof outerData.data === 'string' 
                      ? JSON.parse(outerData.data) 
                      : outerData.data;
                  
                  if (eventData.type === 'stream_start') {
                      startStreaming(
                          eventData.message.conversation_id,
                          eventData.message
                      );
                  } else if (eventData.type === 'stream_chunk') {
                      // Pass both content AND message ID
                      appendStreamChunk(
                          eventData.content,
                          eventData.message_id
                      );
                  } else if (eventData.type === 'stream_end') {
                      endStreaming(eventData.message_id);
                  }
              } catch (error) {
                  console.error("SSE parsing error:", error, event.data);
              }
          };

            eventSource.onerror = (err) => console.error("SSE Connection Error:", err);
        };

        setupSSEConnection();
        
        return () => {
            if (sseRef.current) sseRef.current.close();
        };
    }, [isAuthenticated, startStreaming, appendStreamChunk, endStreaming, handleFailedTask]);

    const handleSelectConversation = useCallback(async (id: string | number) => {
        // Use the 'getState' method to access the latest state without creating a dependency
        const currentConversations = useConversationStore.getState().conversations;
        const targetConversation = currentConversations.find(c => c.id === id);
        if (!targetConversation) return;

        setGlobalSelectedAiModel(targetConversation.aiModelId);
        setStoreConversations(prev => prev.map(c => ({ ...c, active: c.id === id })));

        if (id !== 'new') {
            try {
                const response = await authFetch(`/chat/conversations/${id}/messages`);
                if (!response.ok) throw new Error('Failed to fetch messages.');
                const messagesData: Message[] = await response.json();
                
                setStoreConversations(prev => prev.map(c => 
                    c.id === id ? { ...c, messages: messagesData.map(m => ({ ...m, status: 'complete' as MessageStatus })) } : c
                ));
            } catch (error) {
                console.error(`Error fetching messages for conversation ${id}:`, error);
            }
        }
    }, [setStoreConversations]);
    // --- THIS IS THE CORRECTED USEEFFECT ---
    useEffect(() => {
        const setupUserData = async () => {
            setIsLoading(true);
            if (isAuthenticated && user) {
                const userModels = (user.assigned_models || []).map(model => ({ ...model, name: t(`model.${model.id.replace(/-/g, '')}`, model.display_name) }));
                setAvailableModels(userModels);

                try {
                    const response = await authFetch('/chat/conversations');
                    if (!response.ok) throw new Error('Failed to fetch conversations');
                    const dataFromBackend = await response.json();
                    
                    const data: Conversation[] = dataFromBackend.map((conv: any) => ({ id: conv.id, title: conv.title, created_at: conv.created_at, aiModelId: conv.ai_model_id, messages: [] }));
                    
                    if (data.length > 0) {
                        const conversationsWithState = data.map((conv, index) => ({ ...conv, active: index === 0 }));
                        setStoreConversations(() => conversationsWithState); // Use the store setter
                        setGlobalSelectedAiModel(conversationsWithState[0].aiModelId);
                        // Call the memoized function to load the first conversation's messages
                        await handleSelectConversation(conversationsWithState[0].id);
                    } else {
                        setStoreConversations(() => []);
                        if (userModels.length > 0) setGlobalSelectedAiModel(userModels[0].id);
                    }
                } catch (error) { console.error('An error occurred while fetching conversations:', error); }
            } else {
                setStoreConversations(() => []);
                setAvailableModels([]);
                setGlobalSelectedAiModel('');
                setCurrentView('chat');
            }
            setIsLoading(false);
        };
        
        setupUserData();
    // The dependency array is simplified to break the loop.
    // This effect should only run when the user or language changes.
    }, [isAuthenticated, user, i18n.language, t, handleSelectConversation, setStoreConversations]);

    useEffect(() => { document.title = t('appTitle'); }, [t]);

    const activeConversation = conversations.find(conv => conv.active) || null;
    
    const handleNewConversation = () => {
        if (conversations.some(c => c.id === 'new')) return;
        if (!globalSelectedAiModel) {
            alert(t('noModelsAssignedError'));
            return;
        }
        const newTempConvo: Conversation = { id: 'new', title: t('conversationTitleFallback'), created_at: new Date().toISOString(), messages: [], active: true, aiModelId: globalSelectedAiModel };
        setStoreConversations(prev => [newTempConvo, ...prev.map(c => ({ ...c, active: false }))]);
    };
    
    const handleSendMessage = async (content: string, attachments?: File[]) => {
        if (!activeConversation) return;

        const hasAttachment = attachments && attachments.length > 0;
        const userMessageId = `temp-user-${Date.now()}`;
        
        const optimisticUserMessage: Message = { id: userMessageId, content, role: 'user', timestamp: new Date().toISOString(), status: 'complete', attachment: hasAttachment ? { fileName: attachments![0].name, fileType: attachments![0].type, fileURL: URL.createObjectURL(attachments![0]) } : undefined };
        const optimisticAssistantMessage: Message = { id: `assistant-${userMessageId}`, content: '', role: 'assistant', timestamp: new Date().toISOString(), status: hasAttachment ? 'transcribing' : 'thinking' };

        addOptimisticMessages(activeConversation.id, optimisticUserMessage, optimisticAssistantMessage);

        const isNewConversation = activeConversation.id === 'new';
        const endpoint = isNewConversation ? '/chat/conversations/initiate' : `/chat/conversations/${activeConversation.id}/messages`;
        
        const formData = new FormData();
        formData.append('content', content);
        if (isNewConversation) formData.append('ai_model_id', activeConversation.aiModelId);
        if (hasAttachment) formData.append('attachment', attachments![0]);

        try {
            const response = await fetch(`/api${endpoint}`, { method: 'POST', body: formData, credentials: 'include' });
            if (!response.ok) throw new Error((await response.json()).message || 'API request failed.');

            const { new_conversation, user_message } = await response.json();
            
            syncRealMessage({ isNewConversation, tempUserMessageId: userMessageId, realUserMessage: user_message, newConversationData:  {
                ...new_conversation,
                // Ensure model ID is preserved
                aiModelId: activeConversation.aiModelId 
            }  });

        } catch (error) {
            console.error("Error sending message:", error);
            toast.error("Failed to send message", { description: "Please check your network connection and try again." });
            removeOptimisticMessagesOnError(activeConversation.id, userMessageId, `assistant-${userMessageId}`);
        }
    };

    const handleAiModelChange = (newModelId: string) => {
        setGlobalSelectedAiModel(newModelId);
        if (activeConversation && (activeConversation.id === 'new' || activeConversation.messages.length === 0)) {
            setStoreConversations(prev => prev.map(c => c.id === activeConversation.id ? { ...c, aiModelId: newModelId } : c));
        }
    };

    const handleLogout = () => {
        logout();
        setStoreConversations(() => []);
        setAvailableModels([]);
        setGlobalSelectedAiModel('');
        setCurrentView('chat');
    };

    if (!isAuthenticated) return <ThemeProvider><AuthPage /></ThemeProvider>;
    if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
    
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
                            onOpenAdmin={() => setCurrentView('admin')} // Add this
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
                            <div className="flex-1 flex items-center justify-center"><p className="text-gray-500">{t('noActiveConversation')}</p></div>
                        )}
                    </div>
                )}
                {currentView === 'settings' && <SettingsPanel onBack={() => setCurrentView('chat')} />}
                {currentView === 'admin' && user?.role === 'admin' && <AdminDashboard onBack={() => setCurrentView('chat')} />}

            </div>
        </ThemeProvider>
    );
}

export default App;