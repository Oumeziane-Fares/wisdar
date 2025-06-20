import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LucideUser, LucideBot, LucideFileAudio, LucideMic } from 'lucide-react';
import { MessageRole, Attachment, MessageStatus } from '../../types';

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
  attachment?: Attachment;
  status?: MessageStatus;
  animate: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  content, 
  role, 
  attachment, 
  status = 'complete',
  animate
}) => {
  const { t } = useTranslation();
  const isUser = role === 'user';
  
  const [displayedContent, setDisplayedContent] = useState('');
  const [audioSrc, setAudioSrc] = useState<string | undefined>();
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const targetContentRef = useRef(content);
  targetContentRef.current = content;

  const isPlayableAudio = attachment && 
                          attachment.fileType.startsWith('audio/') && 
                          attachment.fileURL;

  useEffect(() => {
    if (role !== 'assistant' || !animate) {
        setDisplayedContent(targetContentRef.current);
        return;
    }

    const intervalId = setInterval(() => {
        const target = targetContentRef.current;
        
        setDisplayedContent(currentDisplayed => {
            if (currentDisplayed.length < target.length) {
                return target.substring(0, currentDisplayed.length + 1);
            } else {
                clearInterval(intervalId);
                return currentDisplayed;
            }
        });
    }, 30); 

    return () => clearInterval(intervalId);
  }, [role, animate]); 


  useEffect(() => {
    let objectUrl: string | undefined;

    const loadAudio = async () => {
        if (!isPlayableAudio || !attachment?.fileURL) return;
        
        // If the URL is already a blob URL, just use it.
        if (attachment.fileURL.startsWith('blob:')) {
            setAudioSrc(attachment.fileURL);
            return;
        }

        setIsLoadingAudio(true);
        try {
            // Fetch the audio data from the provided URL
            const response = await fetch(attachment.fileURL);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            // Create a blob from the response
            const blob = await response.blob();
            // Create an object URL from the blob
            objectUrl = URL.createObjectURL(blob);
            setAudioSrc(objectUrl);
        } catch (error) {
            console.error("Error loading audio from URL:", error);
            // Optionally set an error state to display to the user
        } finally {
            setIsLoadingAudio(false);
        }
    };

    loadAudio();

    // Cleanup function to revoke the object URL when the component unmounts
    // or the attachment changes, to prevent memory leaks.
    return () => {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    };
  }, [attachment, isPlayableAudio]);


  const handleAudioPlay = () => setIsPlaying(true);
  const handleAudioPause = () => setIsPlaying(false);
  const handleAudioEnded = () => setIsPlaying(false);

  const renderContent = () => {
    if (!isUser && (status === 'thinking' || status === 'transcribing')) {
      return (
        <div className="flex items-center space-x-2 rtl:space-x-reverse text-gray-500 dark:text-gray-400">
          {status === 'transcribing' && <LucideMic size={16} className="animate-pulse text-blue-500" />}
          <span>{status === 'transcribing' ? t('transcribingStatus', 'Transcribing...') : t('thinkingStatus', 'Thinking...')}</span>
          <LoadingIndicator />
        </div>
      );
    }
    if (isPlayableAudio && attachment) {
      const showTranscription = content && content !== t('voiceNoteSent', 'Voice Note');
      return (
        <div className="audio-player-container space-y-2">
          {showTranscription && <p className="text-sm opacity-90 mb-1 whitespace-pre-wrap break-words">{displayedContent}</p>}
          <div className={`flex items-center gap-2 p-1.5 rounded ${isPlaying ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-black/5 dark:bg-white/5'}`}>
            <LucideFileAudio size={22} className={isUser ? "text-purple-500 dark:text-purple-300" : "text-blue-500 dark:text-blue-300"} />
            <span className="text-xs italic truncate flex-grow" title={attachment.fileName}>{attachment.fileName}</span>
          </div>
          <audio controls src={audioSrc} className="w-full h-10 rounded" onPlay={handleAudioPlay} onPause={handleAudioPause} onEnded={handleAudioEnded}>
            {t('audioPlayerNotSupported', 'Your browser does not support the audio element.')}
          </audio>
          {isLoadingAudio && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('loadingAudio', 'Loading audio...')}</div>}
        </div>
      );
    }
    return (
      <p className="whitespace-pre-wrap break-words">
        {displayedContent}
        {status === 'streaming' && <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse" />}
      </p>
    );
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 group`}>
      <div className={`flex max-w-[80%] sm:max-w-[70%] md:max-w-[60%] lg:max-w-[55%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 ${isUser ? 'ml-2 rtl:mr-2 rtl:ml-0' : 'mr-2 rtl:ml-2 rtl:mr-0'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-[#6B5CA5]' : 'bg-gray-200 dark:bg-gray-700'}`}>
            {isUser ? <LucideUser size={16} className="text-white" /> : <LucideBot size={16} className="text-[#6B5CA5] dark:text-gray-300" />}
          </div>
        </div>
        <div className="flex flex-col">
          <div className={`rounded-lg px-3 py-2 shadow-sm ${isUser ? 'bg-[#6B5CA5] text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;