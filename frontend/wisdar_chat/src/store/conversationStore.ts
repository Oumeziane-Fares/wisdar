// src/store/conversationStore.ts
import { create } from 'zustand';
import { Conversation, Message, MessageStatus } from '../types';

interface ConversationState {
    conversations: Conversation[];
    setConversations: (updater: (prev: Conversation[]) => Conversation[]) => void;
    addOptimisticMessages: (conversationId: string | number, userMessage: Message, assistantMessage: Message) => void;
    syncRealMessage: (payload: { isNewConversation: boolean; tempUserMessageId: string | number; realUserMessage: Message; newConversationData?: Conversation; }) => void;
    removeOptimisticMessagesOnError: (conversationId: string | number, userMessageId: string | number, assistantMessageId: string | number) => void;
    startStreaming: (realConversationId: string | number, assistantMessage: Message) => void;
    appendStreamChunk: (content: string,messageId:string | number) => void;
    endStreaming: (messageId: string | number) => void;
    handleFailedTask: (userMessageId: string | number) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
    conversations: [],

    setConversations: (updater) => set(state => ({ conversations: updater(state.conversations) })),

    addOptimisticMessages: (conversationId, userMessage, assistantMessage) => set(state => ({
        conversations: state.conversations.map(c => 
            c.id === conversationId ? { ...c, messages: [...c.messages, userMessage, assistantMessage] } : c
        )
    })),

    // --- HIGHLIGHT: THIS FUNCTION IS CORRECTED FOR THE BUG FIX ---
    syncRealMessage: ({ isNewConversation, tempUserMessageId, realUserMessage, newConversationData }) => set(state => {
        const newConversations = [...state.conversations];
        
        if (isNewConversation && newConversationData) {
            const convoIndex = newConversations.findIndex(c => c.id === 'new' || c.id === newConversationData.id);

            if (convoIndex !== -1) {
                const existingConvo = newConversations[convoIndex];
                // PRESERVE AI MODEL ID
                const aiModelId = existingConvo.aiModelId; // <-- Add this
                const finalMessages = existingConvo.messages.map(m => {
                    // 1. Update the temporary user message with the real one.
                    if (m.id === tempUserMessageId) {
                        return { ...realUserMessage, status: 'complete' as MessageStatus };
                    }
                    
                    // 2. BUG FIX: Check if the assistant message is already streaming.
                    // If it is, the SSE event arrived before the HTTP response.
                    // The message already has its permanent ID, so we MUST NOT change it.
                    if (m.status === 'streaming') {
                        return m; // Leave the message as is to prevent overwriting the real ID.
                    }
                    
                    // 3. If it's still the original placeholder, we can update its temporary ID.
                    // This is safe because the 'streaming' check above prevented the race condition.
                    if (m.id === `assistant-${tempUserMessageId}`) {
                        return { ...m, id: `assistant-${realUserMessage.id}` };
                    }
                    
                    return m;
                });

                const finalNewConversation: Conversation = {
                    ...newConversationData,
                    aiModelId, // <-- Preserve the model ID here
                    messages: finalMessages,
                    active: true,
                };
                newConversations.splice(convoIndex, 1, finalNewConversation);
                return { conversations: newConversations.map(c => c.id === finalNewConversation.id ? c : { ...c, active: false }) };
            }
        } else {
            // This logic for existing conversations is fine.
            return {
                conversations: newConversations.map(c => {
                    const msgIndex = c.messages.findIndex(m => m.id === tempUserMessageId);
                    if (msgIndex === -1) return c;
                    const newMessages = [...c.messages];
                    newMessages[msgIndex] = { ...realUserMessage, status: 'complete' as MessageStatus };
                    return { ...c, messages: newMessages };
                })
            };
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

    endStreaming: (messageId) => set(state => ({
        conversations: state.conversations.map(convo => {
            const msgIndex = convo.messages.findIndex(m => m.id === messageId);
            if (msgIndex === -1) return convo;
            const newMessages = [...convo.messages];
            newMessages[msgIndex] = { ...newMessages[msgIndex], status: 'complete' as MessageStatus };
            return { ...convo, messages: newMessages };
        })
    })),

    handleFailedTask: (userMessageId) => set(state => ({
        conversations: state.conversations.map(convo => ({
            ...convo,
            messages: convo.messages.filter(m => m.id !== `assistant-${userMessageId}`)
        }))
    }))
}));