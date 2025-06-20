import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ChatMessage from './ChatMessage';
import { LucideSend, LucidePaperclip, LucideMic, LucideStopCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AiModel, Message } from '../../types';
import { toast } from "sonner";

// --- Date Formatting Helper Function ---
const formatDateSeparator = (date: Date, t: any, i18n: any) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return t('dateSeparatorToday', 'Today');
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return t('dateSeparatorYesterday', 'Yesterday');
  }
  return date.toLocaleDateString(i18n.language, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};
// ------------------------------------

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
  const { t, i18n } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null); 
  const messagesEndRef = useRef<HTMLDivElement>(null); 
  const [isRecording, setIsRecording] = useState(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null); 

  const [initialMessageCount, setInitialMessageCount] = useState(0);
  const [hasInitialLoadCompleted, setHasInitialLoadCompleted] = useState(false);

  useEffect(() => {
    if (messages.length > 0 && !hasInitialLoadCompleted) {
      setInitialMessageCount(messages.length);
      setHasInitialLoadCompleted(true);
    }
  }, [messages, hasInitialLoadCompleted]);

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
      onSendMessage(t('fileAttachedMessage', { fileName: fileArray.map(f => f.name).join(', ') }), fileArray);
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; 
      }
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error(t('audioRecordingNotSupportedError'));
      toast.error("Oops! Your browser doesn't allow audio recording.", {
      description: "Your browser or device does not support audio recording. Please try using a different browser or update your current one.",
    });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const options = { mimeType: 'audio/webm;codecs=opus' };
      mediaRecorderRef.current = MediaRecorder.isTypeSupported(options.mimeType)
        ? new MediaRecorder(stream, options)
        : new MediaRecorder(stream);
      
      const recorder = mediaRecorderRef.current;
      
      audioChunksRef.current = []; 

      recorder.ondataavailable = (event) => {
        if(event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const fileExtension = recorder.mimeType?.split('/')[1]?.split(';')[0] || 'webm';
        const audioFile = new File([audioBlob], `recorded_voice_${Date.now()}.${fileExtension}`, { type: audioBlob.type });
        
        onSendMessage(t('voiceRecordingCompleteMessage', { fileName: audioFile.name }), [audioFile]);
        
        setIsRecording(false);
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast.error("Microphone access denied.", {
      description: "Please allow microphone access in your browser settings to record audio.",
    });
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
  const isInputDisabled = !selectedModel;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-foreground">
      <div className="py-3 px-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 truncate" title={conversationTitle}>
          {conversationTitle}
        </h2>
        <div className="min-w-[180px] sm:min-w-[200px]">
          <Select value={selectedModel} onValueChange={onSelectModel} disabled={isModelSelectorDisabled}>
            <SelectTrigger className={`h-9 text-xs sm:text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-50 ${isInputDisabled && !isModelSelectorDisabled ? 'border-red-500' : ''}`}>
              <SelectValue placeholder={t('selectAiModelPlaceholder')} />
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
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
            {messages.map((message, index) => {
                const currentMessageDate = new Date(message.timestamp);
                const previousMessage = messages[index - 1];
                const previousMessageDate = previousMessage ? new Date(previousMessage.timestamp) : null;

                const showDateSeparator = !previousMessageDate || currentMessageDate.toDateString() !== previousMessageDate.toDateString();

                return (
                    <React.Fragment key={String(message.id)}>
                        {showDateSeparator && (
                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="bg-white dark:bg-gray-900 px-2 text-xs text-gray-500 dark:text-gray-400">
                                        {formatDateSeparator(currentMessageDate, t, i18n)}
                                    </span>
                                </div>
                            </div>
                        )}
                        <ChatMessage
                            content={message.content}
                            role={message.role}
                            attachment={message.attachment}
                            status={message.status}
                            animate={hasInitialLoadCompleted && index >= initialMessageCount}
                        />
                    </React.Fragment>
                );
            })}
        </div>
        <div ref={messagesEndRef} />
      </ScrollArea>
      
      <div className="border-t border-gray-200 dark:border-gray-700 p-2 sm:p-4">
        <div className="flex items-center gap-1 sm:gap-2">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="audio/*"/>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRecordVoiceClick}
            disabled={isInputDisabled}
            className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ${isRecording ? 'text-red-500 animate-pulse' : 'text-gray-500'} disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={isRecording ? t('stopRecordingAriaLabel') : t('recordVoiceAriaLabel')}
          >
            {isRecording ? <LucideStopCircle size={20} /> : <LucideMic size={20} />}
          </Button>
          <Button
            type="button"
            variant="ghost" 
            size="icon"    
            onClick={handleAttachmentClick}
            disabled={isInputDisabled || isRecording} 
            className="p-2 text-gray-500 hover:text-[#6B5CA5] rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t('attachVoiceNoteAriaLabel')} 
          >
            <LucidePaperclip size={20} />
          </Button>
          {isRecording ? (
            <div className="recording-indicator" aria-label={t('voiceRecordingInProgress')}>
              <span className="recording-animation-bar"></span><span className="recording-animation-bar"></span>
              <span className="recording-animation-bar"></span><span className="recording-animation-bar"></span>
              <span className="recording-animation-bar"></span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-1 sm:gap-2">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isInputDisabled ? t('selectModelToStart') : t('chatInputPlaceholder')}
                disabled={isInputDisabled}
                className="flex-1 h-10 p-3 rounded-lg border disabled:opacity-50"
              />
              <Button type="submit" disabled={!inputValue.trim() || isInputDisabled} className="p-2 h-10 w-10 flex items-center justify-center rounded-lg bg-[#6B5CA5] text-white disabled:opacity-50">
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