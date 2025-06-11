import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, Send, Mic, StopCircle } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/use-toast';
import { Conversation, Message, AiModel } from '../../types';
import { authFetch } from '../../lib/api';
import ChatMessage from './ChatMessage';

interface ChatAreaProps {
  activeConversation: Conversation | null;
  // This function is crucial to let the parent (App.tsx) know a new conversation has been created
  onNewConversation: (newConversation: Conversation, userMessage: Message, assistantMessage?: Message) => void;
  // Props for model selection when starting a new chat
  availableModels: AiModel[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({ 
    activeConversation, 
    onNewConversation,
    availableModels,
    selectedModel,
    onSelectModel
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Effect to fetch initial messages for a conversation
  useEffect(() => {
    const fetchMessages = async () => {
      if (activeConversation) {
        setIsLoading(true);
        try {
          const fetchedMessages = await authFetch(`${import.meta.env.VITE_API_URL}/conversations/${activeConversation.id}/messages`);
          setMessages(fetchedMessages);
        } catch (error) {
          toast({ title: t('error'), description: t('errors.fetchMessages'), variant: 'destructive' });
        } finally {
          setIsLoading(false);
        }
      } else {
        setMessages([]);
      }
    };
    fetchMessages();
  }, [activeConversation, t, toast]);

  // Effect to handle real-time updates via SSE
  useEffect(() => {
    if (!activeConversation) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    const eventSource = new EventSource(
      `${import.meta.env.VITE_API_URL}/stream/${activeConversation.id}?token=${token}`
    );

    eventSource.onmessage = (event) => {
      const newMessage = JSON.parse(event.data);
      setMessages(prevMessages => {
        const existingMessageIndex = prevMessages.findIndex(msg => msg.id === newMessage.id);
        if (existingMessageIndex > -1) {
          const updatedMessages = [...prevMessages];
          updatedMessages[existingMessageIndex] = newMessage;
          return updatedMessages;
        } else {
          return [...prevMessages, newMessage];
        }
      });
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [activeConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (content: string, file?: File) => {
      if (!content.trim() && !file) return;

      setIsLoading(true);
      const formData = new FormData();
      formData.append('content', content);
      if (file) {
          formData.append('attachment', file);
      }

      try {
          if (activeConversation) {
              formData.append('conversation_id', activeConversation.id.toString());
              const response = await authFetch(`${import.meta.env.VITE_API_URL}/messages`, {
                  method: 'POST',
                  body: formData,
              });
              
              const { user_message, assistant_message } = response;
              const newMessages: Message[] = [user_message];
              if (assistant_message) {
                  newMessages.push(assistant_message);
              }
              setMessages(prev => [...prev, ...newMessages]);

          } else {
              if (!selectedModel) {
                  toast({ title: t('error'), description: "Please select an AI model to start the conversation." });
                  setIsLoading(false);
                  return;
              }
              formData.append('ai_model_id', selectedModel);
              const response = await authFetch(`${import.meta.env.VITE_API_URL}/conversations/initiate`, {
                  method: 'POST',
                  body: formData,
              });
              
              const { new_conversation, user_message, assistant_message } = response;
              onNewConversation(new_conversation, user_message, assistant_message);
              const newMessages: Message[] = [user_message];
              if (assistant_message) {
                  newMessages.push(assistant_message);
              }
              setMessages(newMessages);
          }
          
          setInputMessage('');
          if (fileInputRef.current) {
              fileInputRef.current.value = '';
          }
      } catch (error) {
          toast({ title: t('error'), description: t('errors.sendMessage') });
      } finally {
          setIsLoading(false);
      }
  };
  
  const handleSubmitForm = (e: React.FormEvent) => {
      e.preventDefault();
      handleSendMessage(inputMessage);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleSendMessage(t('fileAttachedMessage', { fileName: file.name }), file);
    }
  };

  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
            if(event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const audioFile = new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
            handleSendMessage(t('voiceRecordingCompleteMessage', { fileName: audioFile.name }), audioFile);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
    } catch (err) {
        console.error("Mic access error:", err);
        toast({ title: t('error'), description: "Microphone access was denied." });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const isModelSelectorDisabled = !!activeConversation;

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-800 rounded-r-lg">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 className="font-semibold text-lg truncate" title={activeConversation?.title || "New Conversation"}>
            {activeConversation?.title || t('New Conversation')}
        </h2>
        <div className="min-w-[180px]">
            <Select value={activeConversation?.ai_model_id || selectedModel} onValueChange={onSelectModel} disabled={isModelSelectorDisabled}>
                <SelectTrigger className="h-9">
                    <SelectValue placeholder={t('selectAiModelPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                    {availableModels.map(model => (
                        <SelectItem key={model.id} value={model.id}>{model.display_name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading && messages.length === 0 ? (
          <p>{t('chat.loadingMessages')}</p>
        ) : messages.length === 0 && !activeConversation ? (
            <div className="flex-1 flex items-center justify-center text-center text-gray-500">
                <div>
                    <img src="/images/logo-wisdar-notext.png" alt="Logo" className="mx-auto h-24 w-24 mb-4 opacity-30" />
                    <p>{t('chat.selectModelAndStart')}</p>
                </div>
            </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <form onSubmit={handleSubmitForm} className="relative flex items-center gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="audio/*" />
            <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isLoading || isRecording}>
                <Paperclip className="h-5 w-5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={isRecording ? stopRecording : startRecording} disabled={isLoading}>
                {isRecording ? <StopCircle className="h-5 w-5 text-red-500 animate-pulse" /> : <Mic className="h-5 w-5" />}
            </Button>
            <Textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitForm(e);
                }
                }}
                placeholder={t('chat.typeMessage')}
                className="flex-1"
                disabled={isLoading || isRecording}
            />
            <Button type="submit" size="icon" disabled={isLoading || isRecording || !inputMessage.trim()}>
                <Send className="h-5 w-5" />
            </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatArea;
