import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from './components/ui/ThemeProvider';
import ChatSidebar from './components/chat/ChatSidebar';
import ChatArea  from './components/chat/ChatArea';
import SettingsPanel from './components/settings/SettingsPanel';
import AdminDashboard from './components/admin/AdminDashboard';
import TeamDashboard from './components/admin/TeamDashboard';
import AuthPage from './pages/AuthPage';
import { useAuth } from './contexts/AuthContext';
import { authFetch } from './lib/api';
import { AiProvider, Conversation, Message, MessageStatus } from './types';
import { toast } from "sonner";
import './App.css';
import { useConversationStore } from './store/conversationStore';
import { Routes, Route, Navigate } from 'react-router-dom';
import InvitationPage from './pages/InvitationPage';
import { Toaster } from "@/components/ui/sonner";
import { authUpload } from '@/lib/api';

type View = 'chat' | 'settings' | 'admin'| 'team';

// Add interface for SSE message queue
interface QueuedSSEMessage {
    type: string;
    data: any;
    timestamp: number;
}

const MainApplication = () => {
    if (process.env.NODE_ENV === 'development') {
        console.log("%cRendering: Main Application (Protected)", "color: red; font-weight: bold;");
    }
    
    const { t } = useTranslation();
    const { user, logout } = useAuth();

    const { 
        conversations,
        setConversations: setStoreConversations,
        updateMessage,
        startStreaming,
        appendStreamChunk,
        endStreaming,
        setUserCredits,
        setProviders,
        setConversationContext,
        activeProviderServiceId, // UPDATED
        startStreamingAudio,
        appendAudioChunk,
        finishStreamingAudio,
        setConversationActiveState, // This is our good atomic action
        updateVideoJobProgress,
        providers,
    } = useConversationStore();

    const [currentView, setCurrentView] = useState<View>('chat');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    
    const sseRef = useRef<EventSource | null>(null);
    
    // FIX: Add refs for memory leak prevention and race condition handling
    const tempUrlsRef = useRef<string[]>([]);
    const messageQueueRef = useRef<Map<string, QueuedSSEMessage[]>>(new Map());
    const streamingStatesRef = useRef<Map<string, { isStreaming: boolean; chunks: string[] }>>(new Map());

    // FIX: Race condition handler for SSE messages
    const processMessageQueue = useCallback((messageId: string) => {
        const queue = messageQueueRef.current.get(messageId);
        if (!queue || queue.length === 0) return;

        // Sort messages by timestamp to ensure correct order
        queue.sort((a, b) => a.timestamp - b.timestamp);

        queue.forEach(({ type, data }) => {
            if (type === 'stream_chunk') {
                appendStreamChunk(data.content, data.message_id);
            } else if (type === 'stream_end') {
                endStreaming(data.message_id, () => {
                });
                // Clear the queue after stream ends
                messageQueueRef.current.delete(messageId);
                streamingStatesRef.current.delete(messageId);
            }
        });

        // Clear processed messages
        messageQueueRef.current.set(messageId, []);
    }, [appendStreamChunk, endStreaming]);

    // FIX: Enhanced SSE handler with race condition prevention
    useEffect(() => {        
        const setupSSEConnection = () => {
            if (sseRef.current) {
                sseRef.current.close();
            }
            
            sseRef.current = new EventSource(`/api/stream/events`, { withCredentials: true });
            const eventSource = sseRef.current;
            
            eventSource.onopen = () => {
                if (process.env.NODE_ENV === 'development') {
                    console.log("SSE Connection Established");
                }
            };

            eventSource.onmessage = (event: MessageEvent) => {
                try {
                    const outerData = JSON.parse(event.data);
                    
                    const eventData = outerData.data && typeof outerData.data === 'string'
                        ? JSON.parse(outerData.data)
                        : outerData;

                    const eventType = eventData.type || outerData.type;

                    // Handle streaming audio events
                    if (eventType === 'instructed_tts_start') {
                        startStreamingAudio(eventData.message_id);
                        return;
                    }

                    if (eventType === 'instructed_tts_chunk') {
                        const binaryString = atob(eventData.chunk);
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        appendAudioChunk(bytes);
                        return;
                    }

                    if (eventType === 'instructed_tts_end') {
                        finishStreamingAudio();
                        return;
                    }

                    if (eventType === 'video_complete') {
                        if (process.env.NODE_ENV === 'development') {
                            console.log('video_complete event received:', eventData);
                        }
                        updateMessage(eventData.message_id, {
                            status: MessageStatus.COMPLETE,
                            content: eventData.content,
                            attachment: {
                                fileName: `generated_video.mp4`,
                                fileType: 'video/mp4',
                                fileURL: eventData.videoUrl
                            }
                        });
                        return;
                    }

                    if (eventType === 'tts_complete') {
                        if (process.env.NODE_ENV === 'development') {
                            console.log('tts_complete event received:', eventData);
                        }
                        updateMessage(eventData.message_id, {
                            attachment: {
                                fileName: `tts_audio.mp3`,
                                fileType: 'audio/mpeg',
                                fileURL: eventData.audioUrl
                            }
                        });
                        return;
                    }

                    if (eventType === 'image_complete') {
                        updateMessage(eventData.message_id, {
                            status: MessageStatus.COMPLETE,
                            imageUrl: eventData.imageUrl,
                            content: eventData.content
                        });
                        setConversationContext(eventData.conversation_id, { 
                            imageContextUrl: eventData.imageUrl 
                        });
                        return;
                    }

                    if (eventType === 'transcription_started') {
                        if (process.env.NODE_ENV === 'development') {
                            console.log('transcription_started');
                        }
                        const assistantMessageId = `assistant-${eventData.message_id}`;
                        updateMessage(assistantMessageId, { status: MessageStatus.TRANSCRIBING });
                        return;
                    }

                    if (eventType === 'transcription_complete') {
                        if (process.env.NODE_ENV === 'development') {
                            console.log('transcription_complete');
                        }
                        updateMessage(eventData.message_id, { content: eventData.content });
                        const assistantMessageId = `assistant-${eventData.message_id}`;
                        updateMessage(assistantMessageId, { status: MessageStatus.THINKING });
                        return;
                    }

                    if (eventType === 'audio_extraction_started') {
                        updateMessage(eventData.message_id, { status: MessageStatus.EXTRACTING_AUDIO });
                        return;
                    }

                    if (eventType === 'credits_update') {
                        setUserCredits(eventData.credits);
                        return;
                    }

                    // FIX: Enhanced streaming message handling with race condition prevention
                    if (eventType === 'stream_start') {
                        const messageId = eventData.message.id;
                        streamingStatesRef.current.set(messageId, { isStreaming: true, chunks: [] });
                        startStreaming(eventData.message.conversation_id, eventData.message);
                        return;
                    }

                    if (eventType === 'stream_chunk') {
                        const messageId = eventData.message_id;
                        const streamState = streamingStatesRef.current.get(messageId);
                        
                        if (streamState && streamState.isStreaming) {
                            // Stream is active, process immediately
                            appendStreamChunk(eventData.content, messageId);
                        } else {
                            // Stream not started yet, queue the message
                            const queue = messageQueueRef.current.get(messageId) || [];
                            queue.push({
                                type: eventType,
                                data: eventData,
                                timestamp: Date.now()
                            });
                            messageQueueRef.current.set(messageId, queue);
                        }
                        return;
                    }

                    if (eventType === 'stream_end') {
                        const messageId = eventData.message_id;
                        const streamState = streamingStatesRef.current.get(messageId);
                        
                        if (streamState && streamState.isStreaming) {
                            // Process any queued chunks first
                            processMessageQueue(messageId);
                            // Then end the stream
                            endStreaming(messageId, () => {
                            });
                        } else {
                            // Queue the end message
                            const queue = messageQueueRef.current.get(messageId) || [];
                            queue.push({
                                type: eventType,
                                data: eventData,
                                timestamp: Date.now()
                            });
                            messageQueueRef.current.set(messageId, queue);
                        }
                        return;
                    }

                    if (eventType === 'task_failed') {
                        toast.error(eventData.error, { description: eventData.message });
                        updateMessage(eventData.message_id, { 
                            status: MessageStatus.FAILED, 
                            content: eventData.message,
                            job_status: null,
                            job_metadata: null
                        });
                        return;
                    }

                    if (eventType === 'video_progress_update') {
                        updateVideoJobProgress(
                            eventData.message_id, 
                            eventData.job_status, 
                            eventData.job_metadata
                        );
                        return;
                    }

                    if (eventType === 'new_message_for_edit') {
                        setStoreConversations(conversations => {
                            const convoIndex = conversations.findIndex(c => c.id === eventData.conversation_id);
                            if (convoIndex === -1) return conversations;

                            const updatedConvo = {
                                ...conversations[convoIndex],
                                messages: [...conversations[convoIndex].messages, eventData]
                            };
                            
                            const newConversations = [...conversations];
                            newConversations[convoIndex] = updatedConvo;
                            return newConversations;
                        });
                        return;
                    }

                } catch (error) {
                    console.error("SSE parsing error:", error, event.data);
                }
            };

            eventSource.onerror = (err) => {
                console.error("SSE Connection Error:", err);
                // FIX: Implement retry logic for SSE connection
                if (eventSource.readyState === EventSource.CLOSED) {
                    setTimeout(() => {
                        if (process.env.NODE_ENV === 'development') {
                            console.log("Attempting to reconnect SSE...");
                        }
                        setupSSEConnection();
                    }, 5000); // Retry after 5 seconds
                }
            };
        };

        setupSSEConnection();
        
        return () => {
            if (sseRef.current) {
                sseRef.current.close();
            }
            // Clear message queues on cleanup
            messageQueueRef.current.clear();
            streamingStatesRef.current.clear();
        };
    }, []); // FIX: Removed unstable dependencies

    // FIX: Memory cleanup for temp URLs
    useEffect(() => {
        return () => {
            tempUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
            tempUrlsRef.current = [];
        };
    }, []);

    // FIX: Enhanced conversation selection with combined state updates
    // --- THIS IS THE MODIFIED FUNCTION ---
    const handleSelectConversation = useCallback(async (id: string | number) => {
        const currentConversations = useConversationStore.getState().conversations;
        const targetConversation = currentConversations.find(c => c.id === id);
        if (!targetConversation) return;

        setStoreConversations(prev => prev.map(c => ({ ...c, active: c.id === id })));
        
        // This now works because `setupUserData` correctly maps the providerServiceId
        if (targetConversation.providerId && targetConversation.providerServiceId) {
            setConversationActiveState(targetConversation.providerId, targetConversation.providerServiceId);
        }
        
        if (id !== 'new') {
            try {
                const response = await authFetch(`/chat/conversations/${id}/messages`);
                if (!response.ok) throw new Error('Failed to fetch messages.');
                const messagesData: Message[] = await response.json();
                
                setStoreConversations(prev => prev.map(c => 
                    c.id === id 
                        ? { ...c, messages: messagesData.map(m => ({ ...m, status: MessageStatus.COMPLETE })) }
                        : c
                ));
            } catch (error) {
                console.error(`Error fetching messages for conversation ${id}:`, error);
                toast.error("Failed to load messages for this conversation.");
            }
        }
    }, [setStoreConversations, setConversationActiveState]);
    
    // FIX: Enhanced initial data setup with granular error handling
    useEffect(() => {
        const setupUserData = async () => {
            setIsLoading(true);
            if (user) {
                setUserCredits(user.credits);
                let providersData: AiProvider[] = [];
                try {
                    const providersResponse = await authFetch('/providers');
                    if (providersResponse.ok) {
                        providersData = await providersResponse.json();
                        setProviders(providersData);
                    } else { setProviders([]); }
                } catch (error) { setProviders([]); }

                try {
                    const conversationsResponse = await authFetch('/chat/conversations');
                    if (conversationsResponse.ok) {
                        const conversationsData = await conversationsResponse.json();
                        
                        // --- FIX: Ensure `providerServiceId` is mapped from the backend response ---
                        const data: Conversation[] = conversationsData.map((conv: any) => ({ 
                            id: conv.id, 
                            title: conv.title, 
                            created_at: conv.created_at, 
                            messages: [], 
                            is_pinned: conv.is_pinned,
                            // Map all required IDs for state restoration
                            providerId: conv.provider_id,
                            service_id: conv.service_id,
                            aiModelId: conv.ai_model_id,
                            providerServiceId: conv.provider_service_id, // THIS IS THE CRITICAL FIX
                        }));
                        
                        if (data.length > 0) {
                            const conversationsWithState = data.map((conv, index) => ({ ...conv, active: index === 0 }));
                            setStoreConversations(() => conversationsWithState);
                            await handleSelectConversation(conversationsWithState[0].id); 
                        } else {
                            // Create default conversation only if providers and services are available
                            if (providersData.length > 0) {
                                const defaultProvider = providersData[0];
                                
                                // --- THIS IS THE FIX ---
                                // Add a safety check to ensure the default provider has at least one service
                                if (defaultProvider.services && defaultProvider.services.length > 0) {
                                    const defaultService = defaultProvider.services[0];
                                    
                                    // This check ensures defaultService.providerServiceId is a valid number
                                    if (defaultService && typeof defaultService.providerServiceId === 'number') {
                                        const newTempConvo: Conversation = { 
                                            id: 'new', 
                                            title: t('conversationTitleFallback'), 
                                            created_at: new Date().toISOString(), 
                                            messages: [], 
                                            active: true, 
                                            providerId: defaultProvider.id,
                                            service_id: defaultService.id,
                                            aiModelId: defaultService.modelId,
                                            providerServiceId: defaultService.providerServiceId,
                                        };
                                        
                                        // This call is now safe
                                        setConversationActiveState(defaultProvider.id, defaultService.providerServiceId);
                                        setStoreConversations(() => [newTempConvo]);
                                    }
                                }
                                // If the default provider has no services, we simply do nothing,
                                // leaving the conversation list empty, which is the correct state.
                            }
                        }
                    } else { setStoreConversations(() => []); }
                } catch (error) { setStoreConversations(() => []); }
            } else {
                setStoreConversations(() => []);
                setCurrentView('chat');
            }
            setIsLoading(false);
        };
        
        setupUserData();
    // --- FIX: Remove i18n dependencies to prevent re-fetching data on language change ---
    }, [user, handleSelectConversation]); 

    useEffect(() => { 
        document.title = t('appTitle'); 
    }, [t]);

    const activeConversation = conversations.find(conv => conv.active) || null;
    
    const handleNewConversation = () => {
        if (conversations.some(c => c.id === 'new')) {
            handleSelectConversation('new');
            return;
        }

        // --- FIX: Logic now correctly uses the unique `activeProviderServiceId` ---
        if (!activeProviderServiceId) {
            toast.error(t('noServiceSelectedError', 'Please select a service before starting a new chat.'));
            return;
        }

        let foundProvider = null;
        let foundService = null;
        for (const provider of providers) {
            const service = provider.services.find(s => s.providerServiceId === activeProviderServiceId);
            if (service) {
                foundService = service;
                foundProvider = provider;
                break;
            }
        }

        if (!foundService || !foundProvider) {
            toast.error(t('noServiceSelectedError', 'An error occurred. Please re-select the service.'));
            return;
        }

        const newTempConvo: Conversation = {
            id: 'new',
            title: t('conversationTitleFallback'),
            created_at: new Date().toISOString(),
            messages: [],
            active: true,
            providerId: foundProvider.id,
            service_id: foundService.id,
            aiModelId: foundService.modelId,
            providerServiceId: foundService.providerServiceId, // Include the unique ID
        };
        
        setStoreConversations(prev => [newTempConvo, ...prev.map(c => ({ ...c, active: false }))]);
    };

    const handleSendMessage = async (content: string, attachments?: File[], language?: string) => {
        if (process.env.NODE_ENV === 'development') {
            console.log('[App.tsx] handleSendMessage called with:', { content, attachments });
        }

        const { 
            activeAgent, conversations, setConversations: setStoreConversations,
            addOptimisticMessages, syncRealMessage, removeOptimisticMessagesOnError,
            providers, selectedProviderId, activeProviderServiceId, updateMessageUploadProgress, videoAspectRatio,
        } = useConversationStore.getState();

        const activeConversation = conversations.find(c => c.active);
        if (!activeConversation) {
            console.error("No active conversation found. Aborting.");
            return;
        }

        // Handle agent conversations
        const lastMessage = activeConversation.messages?.length > 0 // FIX: Added null check
            ? activeConversation.messages[activeConversation.messages.length - 1] 
            : null;
        const isAgentWaiting = activeConversation.isAgentConversation && lastMessage?.content.includes('[WAITING_FOR_USER_CONFIRMATION]');

        if (isAgentWaiting) {
            const userMessageId = `temp-user-${Date.now()}`;
            const assistantMessageId = `assistant-${userMessageId}`;

            const optimisticUserMessage: Message = { 
                id: userMessageId, 
                content, 
                role: 'user', 
                timestamp: new Date().toISOString(), 
                status: MessageStatus.COMPLETE 
            };
            const optimisticAssistantMessage: Message = { 
                id: assistantMessageId, 
                content: '', 
                role: 'assistant', 
                timestamp: new Date().toISOString(), 
                status: MessageStatus.THINKING 
            };
            addOptimisticMessages(activeConversation.id, optimisticUserMessage, optimisticAssistantMessage);

            try {
                const response = await authFetch(`/api/conversations/${activeConversation.id}/continue_agent`, {
                    method: 'POST',
                    body: JSON.stringify({ user_input: content })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || "Failed to continue agent conversation.");
                }
                
                const responseData = await response.json();
                syncRealMessage({ 
                    isNewConversation: false, 
                    tempUserMessageId: userMessageId, 
                    realUserMessage: responseData.user_message,
                    assistantMessage: responseData.assistant_message
                });

            } catch (error: any) {
                toast.error("Agent Error", { description: error.message });
                removeOptimisticMessagesOnError(activeConversation.id, userMessageId, assistantMessageId);
            }
            return;
        }

        // Handle new agent conversations
            if (activeAgent) {
                toast.info(`Executing agent: ${activeAgent.name}...`);
                try {
                    let requestBody = {};

                    // Check which agent is active to build the correct request
                    if (activeAgent.name === 'YouTube Summary') {
                        const { youtubeAgentSettings } = useConversationStore.getState();
                        if (!youtubeAgentSettings?.url) {
                            toast.error("Missing YouTube URL", { 
                                description: "Please use the '+' button to add video settings." 
                            });
                            return; // Stop execution if URL is missing
                        }
                        // Create the payload for the YouTube agent
                        requestBody = {
                            prompt: content, // The user's text prompt
                            youtube_settings: {
                                url: youtubeAgentSettings.url,
                                startTime: youtubeAgentSettings.startTime,
                                endTime: youtubeAgentSettings.endTime,
                                fps: youtubeAgentSettings.fps,
                            },
                            temp_conversation_id: activeConversation.id 
                        };
                    } else {
                        // Create the payload for other agents (e.g., Fact-Checker)
                        requestBody = { user_input: content,
                                        temp_conversation_id: activeConversation.id 
                         };
                    }

                    const response = await authFetch(`/agents/${activeAgent.id}/execute`, {
                        method: 'POST',
                        body: JSON.stringify(requestBody),
                    });

                    if (!response.ok) {
                        throw new Error((await response.json()).message || 'Agent execution failed.');
                    }

                    const responseData = await response.json();

                    // **CRITICAL FIX**: Manually map the snake_case response to the camelCase model
                    const newConversationData: Conversation = {
                        id: responseData.id,
                        title: responseData.title,
                        created_at: responseData.created_at,
                        messages: [],
                        active: true,
                        is_pinned: responseData.is_pinned,
                        providerId: responseData.provider_id,
                        service_id: responseData.service_id,
                        aiModelId: responseData.ai_model_id,
                        providerServiceId: responseData.provider_service_id
                    };

                    // Update the store with the new, correctly mapped conversation
                    setStoreConversations(prev => [
                        newConversationData, 
                        ...prev.map(c => ({...c, active: false}))
                    ]);
                    
                    // This will now work correctly because newConversationData is properly mapped
                    await handleSelectConversation(newConversationData.id);

                } catch (error: any) {
                    toast.error("Agent Error", { description: error.message });
                }
                return; // Ensure we exit after handling the agent
            }

            
        // --- FIND THE FULL ACTIVE SERVICE OBJECT ---
        const activeProvider = providers.find(p => p.id === selectedProviderId);
        const activeService = activeProvider?.services.find(s => s.providerServiceId === activeProviderServiceId);
        
        if (!activeService || !selectedProviderId) {
            toast.error("No Service Selected", { description: "Please select an AI service before sending a message." });
            return;
        }

        const userMessageId = `temp-user-${Date.now()}`;
        const assistantMessageId = `assistant-${userMessageId}`;
        const formData = new FormData();
        let optimisticUserMessage: Message;
        let tempFileUrl: string | undefined;
        const imageContextUrl = activeConversation.imageContextUrl;

        // FIX: Enhanced file handling with proper memory management
        if (attachments && attachments.length > 0) {
            if (process.env.NODE_ENV === 'development') {
                console.log('[App.tsx] Step 2: Attachment detected. Creating file message.');
            }
            const file = attachments[0];
            tempFileUrl = URL.createObjectURL(file);
            tempUrlsRef.current.push(tempFileUrl); // FIX: Track URL for cleanup

            optimisticUserMessage = {
                id: userMessageId,
                content: content || file.name,
                role: 'user',
                timestamp: new Date().toISOString(),
                status: MessageStatus.UPLOADING,
                uploadProgress: 0,
                attachment: {
                    fileName: file.name,
                    fileType: file.type,
                    fileURL: tempFileUrl
                }
            };

            formData.append('attachment', file);
            if (language) formData.append('language', language);
        } else {
            if (process.env.NODE_ENV === 'development') {
                console.log('[App.tsx] Step 2: No attachment. Creating text message.');
            }
            optimisticUserMessage = {
                id: userMessageId,
                content: content,
                role: 'user',
                timestamp: new Date().toISOString(),
                status: MessageStatus.COMPLETE,
                attachment: undefined
            };
        }
        
        if (process.env.NODE_ENV === 'development') {
            console.log('[App.tsx] Step 3: Final optimistic message:', optimisticUserMessage);
        }
        
        const optimisticAssistantMessage: Message = { 
            id: assistantMessageId, 
            content: '', 
            role: 'assistant', 
            timestamp: new Date().toISOString(), 
            status: MessageStatus.THINKING 
        };
        addOptimisticMessages(activeConversation.id, optimisticUserMessage, optimisticAssistantMessage);

        formData.append('content', optimisticUserMessage.content);
        if (activeProviderServiceId) {
            formData.append('provider_service_id', String(activeProviderServiceId));
            if (activeConversation.id === 'new') {
                formData.append('provider_service_id', String(activeProviderServiceId));
                formData.append('ai_model_id', activeService.modelId);
                formData.append('provider_id', selectedProviderId);
            }
        }
        if (activeService.id) {
            formData.append('service_id', activeService.id);
        }
        if (activeConversation.id === 'new') {
            formData.append('ai_model_id', activeService.modelId);
            if (selectedProviderId) formData.append('provider_id', selectedProviderId);
        }
        if (activeService.id === 'image' && imageContextUrl) {
            formData.append('image_context_url', imageContextUrl);
        }
        if (activeService.id === 'video' && videoAspectRatio) {
            formData.append('aspect_ratio', videoAspectRatio);
        }

        try {
            const endpoint = activeConversation.id === 'new'
                ? '/chat/conversations/initiate'
                : `/chat/conversations/${activeConversation.id}/messages`;

            if (process.env.NODE_ENV === 'development') {
                console.log('[App.tsx] Step 4: Sending request to backend endpoint:', endpoint);
            }
            
            const response = attachments && attachments.length > 0
                ? await authUpload(endpoint, formData, (progress) => updateMessageUploadProgress(userMessageId, progress))
                : await authFetch(endpoint, { method: 'POST', body: formData });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'API request failed' }));
                throw new Error(errorData.message);
            }

            const responseData = await response.json();
            if (process.env.NODE_ENV === 'development') {
                console.log('[App.tsx] Step 5: Backend response received, syncing message.', responseData);
            }
            
            syncRealMessage({
                isNewConversation: activeConversation.id === 'new' || activeConversation.id.toString().startsWith('agent-'),
                tempUserMessageId: userMessageId,
                realUserMessage: responseData.user_message,
                newConversationData: responseData.new_conversation,
                assistantMessage: responseData.assistant_message
            });

        } catch (error: any) {
            console.error("Error sending message:", error);
            toast.error("Error", { description: error.message || "Could not send message." });
            removeOptimisticMessagesOnError(activeConversation.id, userMessageId, assistantMessageId);
        } finally {
            // FIX: Clean up temp URL immediately after use
            if (tempFileUrl) {
                URL.revokeObjectURL(tempFileUrl);
                tempUrlsRef.current = tempUrlsRef.current.filter(url => url !== tempFileUrl);
            }
        }
    };

    const handleLogout = () => {
        logout();
        setStoreConversations(() => []);
        setCurrentView('chat');
    };

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
                            onOpenAdmin={() => setCurrentView('admin')}
                            onOpenTeam={() => setCurrentView('team')}
                            onLogout={handleLogout}
                        />
                        {activeConversation ? (
                            <div className="flex-1 flex flex-col">
                                <ChatArea 
                                    conversationTitle={activeConversation.title}
                                    messages={activeConversation.messages || []}
                                    onSendMessage={handleSendMessage}
                                    isExistingConversation={(activeConversation.messages || []).length > 0}
                                />
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-gray-500">{t('noActiveConversation')}</p>
                            </div>
                        )}
                    </div>
                )}
                {currentView === 'settings' && <SettingsPanel onBack={() => setCurrentView('chat')} />}
                {currentView === 'admin' && user?.role === 'admin' && <AdminDashboard onBack={() => setCurrentView('chat')} />}
                {currentView === 'team' && user?.role === 'team_admin' && <TeamDashboard onBack={() => setCurrentView('chat')} />}
            </div>
        </ThemeProvider>
    );
};

function App() {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <div className="flex h-screen items-center justify-center">Loading session...</div>;
    }

    return (
        <ThemeProvider>
            <Toaster />
            <Routes>
                <Route path="/invitation/:token" element={<InvitationPage />} />
                <Route 
                    path="/login" 
                    element={!isAuthenticated ? <AuthPage /> : <Navigate to="/" replace />} 
                />
                
                <Route 
                    path="/*" 
                    element={isAuthenticated ? <MainApplication /> : <Navigate to="/login" replace />} 
                />
            </Routes>
        </ThemeProvider>
    );
}

export default App;