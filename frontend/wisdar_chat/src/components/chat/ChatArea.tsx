// frontend/wisdar_chat/src/components/chat/ChatArea.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ChatMessage, { MessageRole } from './ChatMessage'; //
import { LucideSend, LucidePaperclip, LucideMic, LucideStopCircle } from 'lucide-react';
import { Button } from "@/components/ui/button"; //
import { Input } from "@/components/ui/input";   //
import { ScrollArea } from "@/components/ui/scroll-area"; //
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; //
// import { useToast } from '@/hooks/use-toast'; //

export interface AiModel {
  id: string;
  name: string;
}

interface Message {
  id: string;
  content: string;
  role: MessageRole;
  timestamp: string;
}

interface ChatAreaProps {
  conversationTitle: string;
  messages: Message[];
  onSendMessage: (content: string, attachments?: File[]) => void;
  availableModels: AiModel[];
  selectedModel: string; 
  onSelectModel: (modelId: string) => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  conversationTitle,
  messages,
  onSendMessage,
  availableModels,
  selectedModel,
  onSelectModel
}) => {
  const { t } = useTranslation(); 
  const [inputValue, setInputValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null); 
  const messagesEndRef = useRef<HTMLDivElement>(null); 
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null); 
  // const { toast } = useToast(); 

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isRecording) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  const handleAttachmentClick = () => {
    if (isRecording) return; 
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      console.log('Selected voice note(s):', fileArray.map(f => f.name));
      onSendMessage(t('fileAttachedMessage', { fileName: fileArray.map(f => f.name).join(', ') }), fileArray);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; 
      }
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error(t('audioRecordingNotSupportedError'));
      // toast({ title: t('audioRecordingNotSupportedError'), variant: 'destructive' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      setAudioChunks([]); 

      recorder.ondataavailable = (event) => {
        setAudioChunks((prev) => [...prev, event.data]);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: recorder.mimeType || 'audio/webm' });
        const fileExtension = recorder.mimeType?.split('/')[1]?.split(';')[0] || 'webm';
        const audioFile = new File([audioBlob], `recorded_voice_${Date.now()}.${fileExtension}`, { type: audioBlob.type });
        
        onSendMessage(t('voiceRecordingCompleteMessage', { fileName: audioFile.name }), [audioFile]);
        setIsRecording(false);
        if (audioStreamRef.current) { 
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
        }
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        console.error(t('recordingFailedError'));
        // toast({ title: t('recordingFailedError'), variant: 'destructive' });
        setIsRecording(false);
        setAudioChunks([]);
        if (audioStreamRef.current) { 
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        console.error(t('microphonePermissionDeniedError'));
        // toast({ title: t('microphonePermissionDeniedError'), variant: 'destructive' });
      } else {
        console.error(t('recordingFailedError') + ": " + (err as Error).message);
        // toast({ title: t('recordingFailedError'), description: (err as Error).message, variant: 'destructive'});
      }
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleRecordVoiceClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const isModelSelectorDisabled = messages.length > 0;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-foreground">
      {/* Conversation Header */}
      <div className="py-3 px-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 truncate" title={conversationTitle}>
          {conversationTitle}
        </h2>
        <div className="min-w-[180px] sm:min-w-[200px]">
          <Select 
            value={selectedModel} 
            onValueChange={onSelectModel}
            disabled={isModelSelectorDisabled}
          >
            <SelectTrigger className="h-9 text-xs sm:text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-50">
              <SelectValue placeholder={t('selectAiModelPlaceholder', "Select AI Model")} />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800">
              {availableModels.map(model => (
                <SelectItem key={model.id} value={model.id} className="text-xs sm:text-sm dark:text-gray-50 dark:focus:bg-gray-700">
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-16 h-16 bg-[#6B5CA5] rounded-full flex items-center justify-center mb-4">
              <LucideSend size={24} className="text-white transform rotate-[-45deg] -translate-x-0.5 translate-y-0.5" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
              {t('emptyChatTitle')}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
              {t('emptyChatDescription')}
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              content={message.content}
              role={message.role}
              timestamp={message.timestamp}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </ScrollArea>
      
      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-2 sm:p-4">
        <div className="flex items-center gap-1 sm:gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden"
            multiple 
            accept="audio/*"
          />
          {/* Microphone button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRecordVoiceClick}
            className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ${
              isRecording 
                ? 'text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 animate-pulse' 
                : 'text-gray-500 dark:text-gray-400 hover:text-[#6B5CA5] dark:hover:text-purple-400'
            }`}
            aria-label={isRecording ? t('stopRecordingAriaLabel') : t('recordVoiceAriaLabel')}
          >
            {isRecording ? <LucideStopCircle size={20} /> : <LucideMic size={20} />}
          </Button>
          {/* Paperclip button for attaching existing voice notes */}
          <Button
            type="button"
            variant="ghost" 
            size="icon"    
            onClick={handleAttachmentClick}
            disabled={isRecording} 
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#6B5CA5] dark:hover:text-purple-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            aria-label={t('attachVoiceNoteAriaLabel', "Attach voice note")} 
          >
            <LucidePaperclip size={20} />
          </Button>

          {/* MODIFIED: Conditionally render Input form OR Recording Animation */}
          {isRecording ? (
            <div className="recording-indicator" aria-label={t('voiceRecordingInProgress')}>
              <span className="recording-animation-bar"></span>
              <span className="recording-animation-bar"></span>
              <span className="recording-animation-bar"></span>
              <span className="recording-animation-bar"></span>
              <span className="recording-animation-bar"></span>
              {/* Optional: Add a timer display here later */}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-1 sm:gap-2">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={t('chatInputPlaceholder')}
                className="flex-1 h-10 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#6B5CA5] text-gray-900 dark:text-gray-100"
              />
              <Button
                type="submit"
                disabled={!inputValue.trim()}
                className="p-2 h-10 w-10 flex items-center justify-center rounded-lg bg-[#6B5CA5] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#5d4f91] transition-colors"
                aria-label={t('sendButtonLabel', "Send")}
              >
                <LucideSend size={20} />
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatArea;