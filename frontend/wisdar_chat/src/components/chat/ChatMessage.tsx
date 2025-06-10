import React, { useState, useEffect } from 'react'; // 1. Imported useState and useEffect
import { useTranslation } from 'react-i18next';
import { LucideUser, LucideBot, LucideFileAudio } from 'lucide-react';
import { MessageRole, Attachment } from '../../types';
import { fetchAudioBlob } from '../../lib/api'; // 2. Imported our new function

interface ChatMessageProps {
  content: string;
  role: MessageRole;
  timestamp: string;
  attachment?: Attachment;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ content, role, timestamp, attachment }) => {
  const { t, i18n } = useTranslation();
  const isUser = role === 'user';
  
  // 3. State to hold the temporary, playable audio URL
  const [audioSrc, setAudioSrc] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  // Check if there is a potential audio attachment
  const isPlayableAudio = attachment && attachment.fileType.startsWith('audio/') && attachment.fileURL;

  // 4. Effect to securely fetch the audio when the component loads
  useEffect(() => {
    // A variable to hold the temporary URL so we can clean it up later
    let objectUrl: string | undefined;

    const loadAudio = async () => {
      // Only run if there's a valid fileURL
      if (isPlayableAudio && attachment?.fileURL) {
        setIsLoading(true);
        try {
          // Fetch the audio data as a blob using our authenticated function
          const blob = await fetchAudioBlob(attachment.fileURL);
          // Create a temporary URL that the <audio> tag can use
          objectUrl = URL.createObjectURL(blob);
          setAudioSrc(objectUrl);
        } catch (error) {
          console.error("Error loading audio:", error);
          // Optionally handle the error in the UI
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadAudio();

    // 5. Cleanup function to release the temporary URL and prevent memory leaks
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [attachment, isPlayableAudio]); // Rerun this effect only if the attachment changes

  // Format the timestamp into a readable string
  const formattedTimestamp = new Date(timestamp).toLocaleString(i18n.language, {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 group`}>
      <div className={`flex max-w-[80%] sm:max-w-[70%] md:max-w-[60%] lg:max-w-[55%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 ${isUser ? 'ml-2 rtl:mr-2 rtl:ml-0' : 'mr-2 rtl:ml-2 rtl:mr-0'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-[#6B5CA5]' : 'bg-gray-200 dark:bg-gray-700'
          }`}>
            {isUser ? <LucideUser size={16} className="text-white" /> : <LucideBot size={16} className="text-[#6B5CA5] dark:text-gray-300" />}
          </div>
        </div>
        
        {/* Message Bubble */}
        <div className="flex flex-col">
          <div className={`rounded-lg px-3 py-2 shadow-sm ${
            isUser 
              ? 'bg-[#6B5CA5] text-white' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
          }`}>
            {isPlayableAudio && attachment ? (
              <div className="audio-player-container space-y-2 p-1">
                {/* Display text content as a caption if it exists */}
                {(content && content !== t('voiceNoteSent', 'Voice Note') && content !== "Transcription in progress...") && (
                  <p className="text-sm opacity-90 mb-1 whitespace-pre-wrap break-words">{content}</p>
                )}
                <div className="flex items-center gap-2 p-1.5 rounded bg-black/5 dark:bg-white/5">
                  <LucideFileAudio 
                    size={22} 
                    className={isUser ? "text-purple-200" : "text-purple-600 dark:text-purple-400"} 
                  />
                  <span 
                    className="text-xs italic truncate flex-grow" 
                    title={attachment.fileName}
                  >
                    {attachment.fileName}
                  </span>
                </div>
                {/* 6. The audio player now uses the secure, temporary 'audioSrc' */}
                <audio 
                  controls 
                  src={audioSrc} 
                  className="w-full h-10 rounded"
                  // Disable the player until the audio source is loaded and ready
                  disabled={isLoading || !audioSrc}
                >
                  {t('audioPlayerNotSupported', 'Your browser does not support the audio element.')}
                </audio>
              </div>
            ) : (
              // Render plain text content for regular messages
              <p className="whitespace-pre-wrap break-words">{content}</p>
            )}
          </div>
          {/* Timestamp */}
          <div className={`text-xs mt-1 text-gray-500 dark:text-gray-400 ${isUser ? 'text-right rtl:text-left' : 'text-left rtl:text-right'}`}>
            {formattedTimestamp}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
