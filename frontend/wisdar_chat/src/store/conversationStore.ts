import { create } from 'zustand';
import { Conversation, Message, MessageStatus, AiProvider, Agent  } from '../types';

// The new interface combines your existing state with the new credit state.
interface ConversationState {
        // --- NEW: State for the dynamic provider/service UI ---
    providers: AiProvider[];
    selectedProviderId: string | null;
    activeProviderServiceId: number | null;
    
    // --- NEW: Actions to manage the new state ---
    setProviders: (providers: AiProvider[]) => void;
    setSelectedProvider: (providerId: string | null) => void;
    setActiveProviderService: (id: number | null) => void; // Changed from setActiveService

    conversations: Conversation[];
    setConversations: (updater: (prev: Conversation[]) => Conversation[]) => void;
    addOptimisticMessages: (conversationId: string | number, userMessage: Message, assistantMessage: Message) => void;
    // NEW: A flexible action to update any part of a message
    updateMessage: (messageId: string | number, updates: Partial<Message>) => void;
    // --- NEW: Action to update conversation-level properties ---
    setConversationContext: (conversationId: string | number, updates: Partial<Conversation>) => void;
    syncRealMessage: (payload: { isNewConversation: boolean; tempUserMessageId: string | number; realUserMessage: Message; newConversationData?: Conversation & { temp_conversation_id?: string }; assistantMessage?: Message; }) => void;
    removeOptimisticMessagesOnError: (conversationId: string | number, userMessageId: string | number, assistantMessageId: string | number) => void;
    startStreaming: (realConversationId: string | number, assistantMessage: Message) => void;
    appendStreamChunk: (content: string,messageId:string | number) => void;
    endStreaming: (messageId: string | number, onComplete?: () => void) => void
    handleFailedTask: (userMessageId: string | number) => void;
    removeConversation: (conversationId: string | number) => void; 
    updateConversationTitle: (conversationId: string | number, newTitle: string) => void; 
    pinConversation: (conversationId: string | number) => void; // Add this
    // --- NEW: Added from our credit system implementation ---
    userCredits: number;
    setUserCredits: (credits: number) => void;
    activeAgent: Agent | null;
    setActiveAgent: (agent: Agent | null) => void;
    createAgentConversation: (agent: Agent) => void;
    updateMessageUploadProgress: (messageId: string | number, progress: number) => void;
    // ---------------------------------------------------------

    // --- START: ADD NEW VIDEO STATE ---
    videoAspectRatio: string | null;
    videoInputType: 'text' | 'image' | 'video' | null;
    // --- END: ADD NEW VIDEO STATE ---

    // --- START: ADD NEW VIDEO ACTIONS ---
    setVideoAspectRatio: (ratio: string | null) => void;
    setVideoInputType: (type: 'text' | 'image' | 'video' | null) => void;
    // --- END: ADD NEW VIDEO ACTIONS ---

        // --- START: ADD NEW STREAMING AUDIO STATE & ACTIONS ---
    streamingAudio: {
        messageId: string | number;
        audioChunks: Uint8Array[];
        isPlaying: boolean;
    } | null;
    startStreamingAudio: (messageId: string | number) => void;
    appendAudioChunk: (chunk: Uint8Array) => void;
    finishStreamingAudio: () => void;
    // --- END: ADD NEW STREAMING AUDIO STATE & ACTIONS ---

    // --- START: ADD NEW VIDEO JOB STATE & ACTIONS ---
    updateVideoJobProgress: (messageId: string | number, status: string, metadata: any) => void;
    // --- END: ADD NEW VIDEO JOB STATE & ACTIONS ---

    // --- START: ADD THIS NEW ACTION TO THE INTERFACE ---
    setConversationActiveState: (providerId: string, providerServiceId: number) => void;
    // --- END: ADD THIS NEW ACTION TO THE INTERFACE ---

    youtubeAgentSettings: {
        url: string;
        startTime: string;
        endTime: string;
        fps: number;
    } | null;
  setYoutubeAgentSettings: (settings: ConversationState['youtubeAgentSettings']) => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({

       updateMessageUploadProgress: (messageId, progress) => set(state => ({
        conversations: state.conversations.map(convo => ({
            ...convo,
            messages: convo.messages.map(msg =>
                msg.id === messageId 
                ? { ...msg, uploadProgress: progress, status: MessageStatus.UPLOADING } 
                : msg
            )
        }))
    })),
        // --- Default State Values ---
    providers: [],
    selectedProviderId: null,
    activeProviderServiceId: null,
    conversations: [],
    activeAgent: null,
    setActiveAgent: (agent) => set({ activeAgent: agent }),
    setProviders: (providers) => set({ providers }),
    setSelectedProvider: (providerId) => {
        const { providers } = get(); // Use get() to read the current state
        const selectedProvider = providers.find(p => p.id === providerId);
        // Automatically select the first service of the new provider
        const firstProviderServiceId = selectedProvider?.services[0]?.providerServiceId || null;
        set({ 
            selectedProviderId: providerId, 
            activeProviderServiceId: firstProviderServiceId 
        });
    },
    
    setActiveProviderService: (id) => set({ activeProviderServiceId: id }),

    setConversations: (updater) => set(state => ({ conversations: updater(state.conversations) })),

    addOptimisticMessages: (conversationId, userMessage, assistantMessage) => set(state => ({
        conversations: state.conversations.map(c => 
            c.id === conversationId ? { ...c, messages: [...c.messages, userMessage, assistantMessage] } : c
        )
    })),
    // --- THIS IS THE CORRECTED FUNCTION ---
    syncRealMessage: ({ isNewConversation, tempUserMessageId, realUserMessage, newConversationData, assistantMessage }) => set(state => {
        let newConversations = [...state.conversations];
        // --- START MODIFICATION ---
        // The temp ID could be for a normal 'new' chat or a temporary 'agent-...' chat
        const tempIdToFind = newConversationData?.temp_conversation_id || 'new';
        // --- END MODIFICATION ---
        if (isNewConversation && newConversationData && assistantMessage) {
            // This logic handles new conversations
            const convoIndex = newConversations.findIndex(c => c.id === tempIdToFind);
            if (convoIndex !== -1) {
                // Map over messages to update the user message and the assistant placeholder
                const finalMessages = newConversations[convoIndex].messages.map(m => {
                    if (m.id === tempUserMessageId) return { ...realUserMessage, status: MessageStatus.COMPLETE };
                    // [MODIFIED] Replace the optimistic assistant message with the real one from the backend
                    if (m.id === `assistant-${tempUserMessageId}`) return { ...assistantMessage, status: MessageStatus.THINKING  };
                    return m;
                }).filter(Boolean) as Message[]; // Filter out any nulls

                const finalNewConversation: Conversation = {
                    ...newConversationData,
                    providerId: newConversations[convoIndex].providerId, // Preserve the providerId
                    aiModelId: newConversations[convoIndex].aiModelId,
                    messages: finalMessages,
                    active: true,
                };
                newConversations.splice(convoIndex, 1, finalNewConversation);
                return { conversations: newConversations.map(c => c.id === finalNewConversation.id ? c : { ...c, active: false }) };
            }
        } else if (!isNewConversation && assistantMessage) {
            // This logic handles existing conversations
            newConversations = newConversations.map(c => {
                if (!c.messages.some(m => m.id === tempUserMessageId)) return c;
                
                const newMessages = c.messages.map(m => {
                    if (m.id === tempUserMessageId) return { ...realUserMessage, status: MessageStatus.COMPLETE };
                    // [MODIFIED] Replace the optimistic assistant message with the real one
                    if (m.id === `assistant-${tempUserMessageId}`) return { ...assistantMessage, status: MessageStatus.THINKING  };
                    return m;
                });
                return { ...c, messages: newMessages };
            });
            return { conversations: newConversations };
        }
        return { conversations: newConversations };
    }),
    removeOptimisticMessagesOnError: (conversationId, userMessageId, assistantMessageId) => set(state => ({
        conversations: state.conversations.map(c => 
            c.id === conversationId ? { ...c, messages: c.messages.filter(m => m.id !== userMessageId && m.id !== assistantMessageId) } : c
        )
    })),

    startStreaming: (realConversationId, assistantMessage) => set(state => {
        return {
            conversations: state.conversations.map(convo => {
                if (convo.id !== realConversationId && convo.id !== 'new') {
                    return convo;
                }
                
                const updatedConvo = { ...convo };
                const placeholderIndex = updatedConvo.messages.findIndex(m => 
                    m.status === 'thinking' || m.status === 'transcribing'
                );
                
                if (placeholderIndex !== -1) {
                    const newMessages = [...updatedConvo.messages];
                    newMessages[placeholderIndex] = {
                        ...newMessages[placeholderIndex],
                        id: assistantMessage.id,
                        content: assistantMessage.content || '',
                        status: 'streaming' as MessageStatus
                    };
                    updatedConvo.messages = newMessages;
                }
                return updatedConvo;
            })
        };
    }),

    appendStreamChunk: (content, messageId) => set(state => ({
        conversations: state.conversations.map(convo => {
            const msgIndex = convo.messages.findIndex(m => 
                m.id === messageId && m.status === 'streaming'
            );
            
            if (msgIndex === -1) return convo;
            
            const updatedMessage = { 
                ...convo.messages[msgIndex], 
                content: convo.messages[msgIndex].content + content
            };
            
            const newMessages = [...convo.messages];
            newMessages[msgIndex] = updatedMessage;
            return { ...convo, messages: newMessages };
        })
    })),

    endStreaming: (messageId, onComplete) => {
        set(state => {
            const newConversations = state.conversations.map(convo => {
                const msgIndex = convo.messages.findIndex(m => m.id === messageId);
                if (msgIndex === -1) return convo;
                const newMessages = [...convo.messages];
                newMessages[msgIndex] = { ...newMessages[msgIndex], status: 'complete' as MessageStatus };
                return { ...convo, messages: newMessages };
            });
            return { conversations: newConversations };
        });
        console.log("%c[Store] 3. state updated, executing onComplete callback.", "color: orange; font-weight: bold;");
        onComplete?.();
    },
    handleFailedTask: (userMessageId) => set(state => ({
        conversations: state.conversations.map(convo => ({
            ...convo,
            messages: convo.messages.filter(m => m.id !== `assistant-${userMessageId}`)
        }))
    })),
    removeConversation: (conversationId) => set(state => {
        // Find if the conversation being deleted is the active one
        const conversationToRemove = state.conversations.find(c => c.id === conversationId);
        const isRemovingActive = conversationToRemove?.active;
        
        const remainingConversations = state.conversations.filter(c => c.id !== conversationId);

        // If the active conversation was deleted, make the first one active
        if (isRemovingActive && remainingConversations.length > 0) {
            remainingConversations[0].active = true;
        }

        return { conversations: remainingConversations };
    }),
    // --- ADD THIS NEW ACTION ---
    updateConversationTitle: (conversationId, newTitle) => set(state => ({
        conversations: state.conversations.map(c =>
            c.id === conversationId ? { ...c, title: newTitle } : c
        ),
    })),
    pinConversation: (conversationId) => set(state => {
        let pinnedConversation: Conversation | undefined;
        
        // First, toggle the 'is_pinned' status
        const updatedConversations = state.conversations.map(c => {
            if (c.id === conversationId) {
                pinnedConversation = { ...c, is_pinned: !c.is_pinned };
                return pinnedConversation;
            }
            return c;
        });

        // Now, sort the array: pinned first, then by date
        updatedConversations.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            // If both have the same pin status, sort by date
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return { conversations: updatedConversations };
    }),
       // ADD THIS NEW ACTION
    createAgentConversation: (agent) => {
        const { providers } = get();

        // Find the full service details linked to the agent
        const provider = providers.find(p => p.services.some(s => s.providerServiceId === agent.provider_service_id));
        const service = provider?.services.find(s => s.providerServiceId === agent.provider_service_id);

        if (!provider || !service) {
            console.error("Could not find matching provider/service for agent", agent);
            return;
        }

        const newAgentConversation: Conversation = {
            id: `agent-${Date.now()}`, // A unique temporary ID
            title: `Agent: ${agent.name}`,
            created_at: new Date().toISOString(),
            isAgentConversation: true, // Mark this as a special conversation
            messages: [{
                id: 'agent-welcome',
                role: 'assistant',
                content: `### ${agent.name}\n\n${agent.description}`,
                status: 'complete' as MessageStatus,
                timestamp: new Date().toISOString()
            }],
            active: true,
            providerId: provider.id,       // Pre-selected from agent
            service_id: service.id,        // Pre-selected from agent
            aiModelId: service.modelId,    // Pre-selected from agent
            providerServiceId: agent.provider_service_id,
        };

        set(state => ({
            // --- THE FIX: Add this line to set the active agent ---
            activeAgent: agent, 
            // Add the new agent conversation to the top of the list
            conversations: [newAgentConversation, ...state.conversations.map(c => ({...c, active: false}))]
        }));
    },
    // --- [NEW] ADD THIS ACTION TO UPDATE CONVERSATION CONTEXT ---
    setConversationContext: (conversationId, updates) => set(state => ({
        conversations: state.conversations.map(c => 
            c.id === conversationId ? { ...c, ...updates } : c
        )
    })),

    // --- NEW: Added from our credit system implementation ---
    userCredits: 10000, // Initialize with a default value
    setUserCredits: (credits) => set({ userCredits: credits }),
    // ---------------------------------------------------------
    // --- NEW: Implementation for the updateMessage action ---
    updateMessage: (messageId, updates) => set(state => ({
        conversations: state.conversations.map(convo => ({
            ...convo,
            messages: convo.messages.map(msg => 
                msg.id === messageId ? { ...msg, ...updates } : msg
            )
        }))
    })),
    // --------------------------------------------------------
    // --- START: ADD NEW ACTION IMPLEMENTATIONS ---
    // Add these new properties at the end, before the final closing bracket
    videoAspectRatio: null,
    videoInputType: 'text',
    setVideoAspectRatio: (ratio) => set({ videoAspectRatio: ratio }),
    setVideoInputType: (type) => set({ videoInputType: type }),
    // --- END: ADD NEW ACTION IMPLEMENTATIONS ---
        // --- START: ADD NEW ACTION IMPLEMENTATIONS ---
    // Add these new properties at the end
    streamingAudio: null,
    startStreamingAudio: (messageId) => set({ 
        streamingAudio: { 
            messageId, 
            audioChunks: [],
            isPlaying: true // Start playing immediately
        } 
    }),
    appendAudioChunk: (chunk) => set(state => {
        if (!state.streamingAudio) return {};
        return {
            streamingAudio: {
                ...state.streamingAudio,
                audioChunks: [...state.streamingAudio.audioChunks, chunk],
            }
        };
    }),
    finishStreamingAudio: () => set(state => {
        if (!state.streamingAudio) return {};
        return {
            streamingAudio: {
                ...state.streamingAudio,
                isPlaying: false, // Signal that the stream is complete
            }
        };
    }),
    // --- END: ADD NEW ACTION IMPLEMENTATIONS ---
        // --- START: ADD NEW ACTION IMPLEMENTATION ---
    // Add this new action at the end of the create() function
        // Replace it with this corrected version:
        updateVideoJobProgress: (messageId, status, metadata) => set(state => ({
            conversations: state.conversations.map(convo => ({
                ...convo,
                messages: convo.messages.map(msg => {
                    if (msg.id === messageId) {
                        // This is the fix: It merges the updates with the existing message data.
                        const updatedMsg = { ...msg };
                        if (status) {
                            updatedMsg.job_status = status;
                        }
                        if (metadata) {
                            updatedMsg.job_metadata = metadata;
                        }
                        return updatedMsg;
                    }
                    return msg;
                })
            }))
        })),
    // --- END: ADD NEW ACTION IMPLEMENTATION ---
    // --- START: ADD THIS NEW ACTION IMPLEMENTATION AT THE END ---
    setConversationActiveState: (providerId, providerServiceId) => set({
        selectedProviderId: providerId,
        activeProviderServiceId: providerServiceId
    }),
    // --- END: ADD THIS NEW ACTION IMPLEMENTATION AT THE END ---
      // Add these new state properties at the end
  youtubeAgentSettings: null,
  setYoutubeAgentSettings: (settings) => set({ youtubeAgentSettings: settings }),

}));
