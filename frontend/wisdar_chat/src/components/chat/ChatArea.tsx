import React, { useState } from 'react';
import { LucideSend, LucidePaperclip } from 'lucide-react';
import ChatMessage, { MessageRole } from './ChatMessage';

interface Message {
  id: string;
  content: string;
  role: MessageRole;
  timestamp: string;
}

interface ChatAreaProps {
  conversationTitle: string;
  messages: Message[];
  onSendMessage: (content: string) => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  conversationTitle,
  messages,
  onSendMessage
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* En-tête de conversation */}
      <div className="py-3 px-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">
          {conversationTitle}
        </h2>
      </div>
      
      {/* Zone des messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <div className="w-16 h-16 bg-[#6B5CA5] rounded-full flex items-center justify-center mb-4">
              <LucideSend size={24} className="text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
              Commencez une nouvelle conversation
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
              Envoyez un message pour démarrer une conversation avec l'assistant Wisdar.
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
      </div>
      
      {/* Zone de saisie */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <button
            type="button"
            className="p-2 text-gray-500 hover:text-[#6B5CA5] rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <LucidePaperclip size={20} />
          </button>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Écrivez votre message..."
            className="flex-1 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#6B5CA5] text-gray-900 dark:text-gray-100"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="p-3 rounded-lg bg-[#6B5CA5] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#5d4f91] transition-colors"
          >
            <LucideSend size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatArea;
