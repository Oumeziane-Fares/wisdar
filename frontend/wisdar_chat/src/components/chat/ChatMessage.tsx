import React from 'react';
import { LucideUser, LucideBot } from 'lucide-react';

export type MessageRole = 'user' | 'assistant';

interface ChatMessageProps {
  content: string;
  role: MessageRole;
  timestamp: string;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ content, role, timestamp }) => {
  const isUser = role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 ${isUser ? 'ml-3' : 'mr-3'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-[#6B5CA5]' : 'bg-gray-200 dark:bg-gray-700'
          }`}>
            {isUser ? (
              <LucideUser size={16} className="text-white" />
            ) : (
              <LucideBot size={16} className="text-[#6B5CA5] dark:text-gray-300" />
            )}
          </div>
        </div>
        
        {/* Message content */}
        <div>
          <div className={`rounded-lg px-4 py-2 ${
            isUser 
              ? 'bg-[#6B5CA5] text-white' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
          }`}>
            {content}
          </div>
          <div className={`text-xs mt-1 text-gray-500 ${isUser ? 'text-right' : 'text-left'}`}>
            {timestamp}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
