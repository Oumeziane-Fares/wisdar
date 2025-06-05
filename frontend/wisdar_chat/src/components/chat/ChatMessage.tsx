// frontend/wisdar_chat/src/components/chat/ChatMessage.tsx
import React from 'react';
import { LucideUser, LucideBot, LucideFileAudio } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type MessageRole = 'user' | 'assistant';

interface Attachment { // Ensure this matches App.tsx's Attachment interface
  fileName: string;
  fileType: string;
  fileURL: string;
}

interface ChatMessageProps {
  content: string;
  role: MessageRole;
  timestamp: string;
  attachment?: Attachment; 
}

const ChatMessage: React.FC<ChatMessageProps> = ({ content, role, timestamp, attachment }) => {
  const { t } = useTranslation(); 
  const isUser = role === 'user';
  const isPlayableAudio = attachment && attachment.fileType.startsWith('audio/') && attachment.fileURL;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 group`}>
      <div className={`flex max-w-[80%] sm:max-w-[70%] md:max-w-[60%] lg:max-w-[55%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 ${isUser ? 'ml-2 rtl:mr-2 rtl:ml-0' : 'mr-2 rtl:ml-2 rtl:mr-0'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-[#6B5CA5]' : 'bg-gray-200 dark:bg-gray-700'
          }`}>
            {isUser ? <LucideUser size={16} className="text-white" /> : <LucideBot size={16} className="text-[#6B5CA5] dark:text-gray-300" />}
          </div>
        </div>
        
        <div className="flex flex-col">
          <div className={`rounded-lg px-3 py-2 shadow-sm ${
            isUser 
              ? 'bg-[#6B5CA5] text-white' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
          }`}>
            {isPlayableAudio && attachment ? (
              <div className="audio-player-container space-y-1.5">
                {content && content !== t('voiceNoteSent', 'Voice Note') && (
                  <p className="text-sm opacity-90 mb-1 whitespace-pre-wrap break-words">{content}</p>
                )}
                <div className="flex items-center gap-2 p-1.5 rounded bg-black/5 dark:bg-white/5">
                  <LucideFileAudio 
                    size={22} 
                    className={isUser ? "text-purple-200" : "text-purple-600 dark:text-purple-400"} 
                  />
                  <span className="text-xs italic truncate flex-grow" title={attachment.fileName}>
                    {attachment.fileName}
                  </span>
                </div>
                <audio controls src={attachment.fileURL} className="w-full h-10 rounded">
                  {t('audioPlayerNotSupported', 'Your browser does not support the audio element.')}
                </audio>
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words">{content}</p>
            )}
          </div>
          <div className={`text-xs mt-1 text-gray-500 dark:text-gray-400 ${isUser ? 'text-right rtl:text-left' : 'text-left rtl:text-right'}`}>
            {timestamp}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;