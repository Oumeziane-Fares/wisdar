// frontend/wisdar_chat/src/components/chat/ChatMessage.tsx

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LucideUser, LucideBot, LucideFileAudio, LucideMic } from 'lucide-react';
import { MessageRole, Attachment, MessageStatus } from '../../types';
import { fetchAudioBlob } from '../../lib/api';

// Loading indicator component
const LoadingIndicator: React.FC = () => (
  <div className="flex items-center space-x-1 rtl:space-x-reverse">
    <span className="h-1.5 w-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
    <span className="h-1.5 w-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
    <span className="h-1.5 w-1.5 bg-current rounded-full animate-bounce" />
  </div>
);

interface ChatMessageProps {
  content: string;
  role: MessageRole;
  timestamp: string;
  attachment?: Attachment;
  status?: MessageStatus;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  content, 
  role, 
  timestamp, 
  attachment, 
  status = 'complete' 
}) => {
  const { t, i18n } = useTranslation();
  const isUser = role === 'user';
  
  const [audioSrc, setAudioSrc] = useState<string | undefined>();
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const isPlayableAudio = attachment && 
                         attachment.fileType.startsWith('audio/') && 
                         attachment.fileURL;

  // Load audio when attachment changes
  useEffect(() => {
    let objectUrl: string | undefined;
    let shouldSetState = true;

    const loadAudio = async () => {
      if (!isPlayableAudio || !attachment?.fileURL) return;
      
      // If we already have a blob URL, use it directly
      if (attachment.fileURL.startsWith('blob:')) {
        if (shouldSetState) setAudioSrc(attachment.fileURL);
        return;
      }
      
      setIsLoadingAudio(true);
      try {
        const blob = await fetchAudioBlob(attachment.fileURL);
        objectUrl = URL.createObjectURL(blob);
        if (shouldSetState) setAudioSrc(objectUrl);
      } catch (error) {
        console.error("Error loading audio:", error);
      } finally {
        if (shouldSetState) setIsLoadingAudio(false);
      }
    };
    
    loadAudio();
    
    return () => {
      shouldSetState = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment, isPlayableAudio]);

  const formattedTimestamp = new Date(timestamp).toLocaleString(i18n.language, {
    month: 'long', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true,
  });

  // Handle audio playback events
  const handleAudioPlay = () => setIsPlaying(true);
  const handleAudioPause = () => setIsPlaying(false);
  const handleAudioEnded = () => setIsPlaying(false);

  // Render message content based on status and type
  const renderContent = () => {
    // Loading states for assistant messages
    if (!isUser && (status === 'thinking' || status === 'transcribing')) {
      return (
        <div className="flex items-center space-x-2 rtl:space-x-reverse text-gray-500 dark:text-gray-400">
          {status === 'transcribing' && (
            <LucideMic size={16} className="animate-pulse text-blue-500" />
          )}
          <span>
            {status === 'transcribing' 
              ? t('transcribingStatus', 'Transcribing...') 
              : t('thinkingStatus', 'Thinking...')}
          </span>
          <LoadingIndicator />
        </div>
      );
    }
    
    // Audio message display
    if (isPlayableAudio && attachment) {
      const showTranscription = content && content !== t('voiceNoteSent', 'Voice Note');
      
      return (
        <div className="audio-player-container space-y-2">
          {showTranscription && (
            <p className="text-sm opacity-90 mb-1 whitespace-pre-wrap break-words">
              {content}
            </p>
          )}
          
          <div className={`flex items-center gap-2 p-1.5 rounded ${
            isPlaying 
              ? 'bg-blue-100 dark:bg-blue-900/30' 
              : 'bg-black/5 dark:bg-white/5'
          }`}>
            <LucideFileAudio 
              size={22} 
              className={isUser 
                ? "text-purple-500 dark:text-purple-300" 
                : "text-blue-500 dark:text-blue-300"
              } 
            />
            <span 
              className="text-xs italic truncate flex-grow" 
              title={attachment.fileName}
            >
              {attachment.fileName}
            </span>
          </div>
          
          <audio 
            controls 
            src={audioSrc} 
            className="w-full h-10 rounded"
            disabled={isLoadingAudio || !audioSrc}
            onPlay={handleAudioPlay}
            onPause={handleAudioPause}
            onEnded={handleAudioEnded}
          >
            {t('audioPlayerNotSupported', 'Your browser does not support the audio element.')}
          </audio>
          
          {isLoadingAudio && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('loadingAudio', 'Loading audio...')}
            </div>
          )}
        </div>
      );
    }
    
    // Text message display
    return (
      <p className="whitespace-pre-wrap break-words">
        {content}
        {/* Blinking cursor for streaming messages */}
        {status === 'streaming' && (
          <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse" />
        )}
      </p>
    );
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 group`}>
      <div className={`flex max-w-[80%] sm:max-w-[70%] md:max-w-[60%] lg:max-w-[55%] ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      }`}>
        <div className={`flex-shrink-0 ${isUser ? 'ml-2 rtl:mr-2 rtl:ml-0' : 'mr-2 rtl:ml-2 rtl:mr-0'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isUser 
              ? 'bg-[#6B5CA5]' 
              : 'bg-gray-200 dark:bg-gray-700'
          }`}>
            {isUser ? (
              <LucideUser size={16} className="text-white" />
            ) : (
              <LucideBot size={16} className="text-[#6B5CA5] dark:text-gray-300" />
            )}
          </div>
        </div>
        
        <div className="flex flex-col">
          <div className={`rounded-lg px-3 py-2 shadow-sm ${
            isUser 
              ? 'bg-[#6B5CA5] text-white' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
          }`}>
            {renderContent()}
          </div>
          
          {/* Show timestamp only for complete messages */}
          {status === 'complete' && (
            <div className={`text-xs mt-1 text-gray-500 dark:text-gray-400 ${
              isUser ? 'text-right rtl:text-left' : 'text-left rtl:text-right'
            }`}>
              {formattedTimestamp}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;