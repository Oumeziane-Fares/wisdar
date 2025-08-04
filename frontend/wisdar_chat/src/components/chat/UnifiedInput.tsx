import React, { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LucidePaperclip, LucideSend, Bot, X, PlusCircle } from 'lucide-react'; // Import PlusCircle
import { Agent } from '@/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ModelSelectorPopover from './ModelSelectorPopover';

// Define the component's props interface
interface UnifiedInputProps {
  inputValue: string;
  setInputValue: (value: string) => void;
  onSendMessage: () => void;
  onAttachmentClick: () => void;
  isInputDisabled: boolean;
  activeAgent: Agent | null;
  onClearAgent: () => void;
  isExistingConversation: boolean;
  onOpenYouTubeSettings?: () => void; // Add the new prop
}

const UnifiedInput: React.FC<UnifiedInputProps> = ({
  inputValue,
  setInputValue,
  onSendMessage,
  onAttachmentClick,
  isInputDisabled,
  activeAgent,
  onClearAgent,
  isExistingConversation,
  onOpenYouTubeSettings, // Destructure the new prop
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Auto-focus Logic ---
  const prevIsInputDisabled = useRef(isInputDisabled);
  useEffect(() => {
    if (prevIsInputDisabled.current === true && isInputDisabled === false) {
      textareaRef.current?.focus();
    }
    prevIsInputDisabled.current = isInputDisabled;
  }, [isInputDisabled]);

  // --- Auto-growing Textarea Logic ---
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  // --- "Send on Enter" Logic ---
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim()) {
        onSendMessage();
      }
    }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {/* Conditionally renders the Active Agent badge above the input */}
      {activeAgent && (
        <div className="absolute -top-10 left-0">
          <Badge variant="secondary" className="flex items-center gap-2 text-md py-1 px-3">
            <Bot size={16} />
            Agent: {activeAgent.name}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-full"
              onClick={onClearAgent}
              disabled={isInputDisabled}
            >
              <X size={14} />
            </Button>
          </Badge>
        </div>
      )}

      {/* Main Input Container */}
      <div
        className={cn(
          'flex items-end w-full rounded-2xl border border-input bg-background p-2.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          isInputDisabled && 'opacity-75 cursor-not-allowed'
        )}
      >
        {/* Conditionally render the YouTube settings button */}
        {activeAgent?.name === 'YouTube Summary' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenYouTubeSettings}
            disabled={isInputDisabled}
            className="h-9 w-9"
            aria-label="YouTube Settings"
          >
            <PlusCircle size={20} />
          </Button>
        )}

        {/* Attachment Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onAttachmentClick}
          disabled={isInputDisabled || activeAgent?.name === 'YouTube Summary'}
          aria-label="Attach file"
          className="h-9 w-9"
        >
          <LucidePaperclip size={20} />
        </Button>

        {/* Textarea */}
        <div className="mx-2 flex-1">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeAgent?.name === 'YouTube Summary'
                ? 'Enter a prompt for the video...'
                : 'Ask me anything...'
            }
            disabled={isInputDisabled}
            rows={1}
            className="w-full resize-none border-0 bg-transparent p-0 text-base placeholder-muted-foreground shadow-none focus-visible:ring-0"
          />
        </div>

        {/* Right-side controls: Model Selector and Send Button */}
        <div className="flex items-end gap-2">
          <ModelSelectorPopover disabled={isExistingConversation} onSelect={() => textareaRef.current?.focus()}/>
          <Button
            type="button"
            size="icon"
            onClick={onSendMessage}
            disabled={!inputValue.trim() || isInputDisabled}
            aria-label="Send message"
            className="h-9 w-9 bg-[#6B5CA5] text-white shrink-0 hover:bg-[#5d4f91] disabled:bg-muted"
          >
            <LucideSend size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UnifiedInput;