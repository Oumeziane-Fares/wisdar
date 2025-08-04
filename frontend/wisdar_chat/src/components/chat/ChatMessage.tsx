import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LucideUser, LucideBot, LucideMic, LucideAlertTriangle, LucideVolume2, Download,LucideLoader2,LucidePenSquare } from 'lucide-react';
import { MessageRole, Attachment, MessageStatus } from '../../types';
import { Progress } from "@/components/ui/progress";
import AudioPlayer from './AudioPlayer';
import VideoPlayer from './VideoPlayer';
import { authFetch } from '../../lib/api';
import { toast } from 'sonner';
import StreamingAudioPlayer from './StreamingAudioPlayer';
import { useConversationStore } from '@/store/conversationStore';
import { cn } from '../../lib/utils';
import { Button } from "@/components/ui/button";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const LoadingIndicator: React.FC = () => (
  <div className="flex items-center space-x-1 rtl:space-x-reverse">
    <span className="h-1.5 w-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
    <span className="h-1.5 w-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
    <span className="h-1.5 w-1.5 bg-current rounded-full animate-bounce" />
  </div>
);

interface ChatMessageProps {
  id?: string | number;
  content: string;
  role: MessageRole;
  attachment?: Attachment;
  status?: MessageStatus;
  uploadProgress?: number;
  imageUrl?: string;
  onImageClick?: (src: string) => void;
  // --- START: ADD THESE TWO LINES ---
  job_status?: string | null;
  job_metadata?: any;
  // --- END: ADD THESE TWO LINES ---
  onSendMessage: (content: string, attachments?: File[], language?: string) => void;
  onEditClick: (text: string) => void; 
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  id,
  content,
  role,
  attachment,
  status = 'complete',
  uploadProgress = 0,
  imageUrl,
  onImageClick,
  job_status,
  job_metadata,
  onEditClick,
}) => {
  const { t } = useTranslation();
  const isUser = role === 'user';

  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [playableAudioUrl, setPlayableAudioUrl] = useState<string | null>(null);
  const streamingAudio = useConversationStore(state => state.streamingAudio);

  useEffect(() => {
    const isPlayableAudio = attachment && attachment.fileType.startsWith('audio/') && attachment.fileURL;
    if (isPlayableAudio) {
      setPlayableAudioUrl(attachment.fileURL);
      setIsTtsLoading(false);
    } else {
      setPlayableAudioUrl(null);
    }
  }, [attachment]);

  const handlePlayTts = async () => {
    if (!id || isTtsLoading) return;
    setIsTtsLoading(true);
    try {
      const response = await authFetch(`/chat/messages/${id}/generate-audio`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to start audio generation.');
      }
      toast.info("Generating audio, please wait...");
    } catch (error) {
      console.error("TTS Error:", error);
      toast.error("Could not generate audio for this message.");
      setIsTtsLoading(false);
    }
  };
  const handleDownloadAudio = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    // Suggest a filename for the download
    link.setAttribute('download', 'wisdar-audio.mp3'); 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  // RENDERCONTENT FUNCTION: Single, corrected version
  const renderContent = () => {
    const isPlayableVideo = attachment && attachment.fileType?.startsWith('video/') && attachment.fileURL;
    if (isPlayableVideo) {
      return <VideoPlayer src={attachment.fileURL!} />;
    }
    if (role === 'assistant' && job_status) {
      const scenes = job_metadata?.scenes || [];
      const completedClips = job_metadata?.completed_clips || 0;
      const totalClips = job_metadata?.total_clips || 0;

      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LucideLoader2 className="animate-spin text-[#6B5CA5]" />
            <p className="font-semibold">{job_status}</p>
          </div>
          {/* If the scenes have been planned, display them */}
          {scenes.length > 0 && (
            <div className="space-y-2 text-sm text-muted-foreground pl-6 border-l-2 border-gray-200 dark:border-gray-700">
              <p className="font-medium">Generation Plan ({completedClips}/{totalClips} clips complete):</p>
              <ul className="list-disc list-inside space-y-1">
                {scenes.map((scene: string, index: number) => (
                  <li key={index} className={cn(index < completedClips && "line-through text-green-600")}>
                    {scene}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    // --- END: ADD THIS NEW BLOCK ---



    if (role === 'assistant' && imageUrl) {
      return (
        <button
          onClick={() => onImageClick?.(imageUrl)}
          className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus-visible:ring-ring rounded-lg"
        >
          <div className="space-y-2">
            <img src={imageUrl} alt={content || 'Generated image'} className="rounded-lg max-w-full h-auto border dark:border-gray-700" />
            {content && <p className="text-sm text-gray-600 dark:text-gray-400">{content}</p>}
          </div>
        </button>
      );
    }

    if (isUser && status === MessageStatus.UPLOADING) {
      return (
        <div className="space-y-2 w-full min-w-[180px]">
          <div className="flex justify-between items-center text-xs text-white/80">
            <span>{t('uploadingAudio', 'Uploading...')}</span>
            <span>{Math.round(uploadProgress)}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2 bg-purple-400/30" />
        </div>
      );
    }

    if (status === MessageStatus.FAILED || status === MessageStatus.ERROR) {
      return (
        <div className={`flex items-center gap-2 ${isUser ? 'text-white/90' : 'text-red-500 dark:text-red-400'}`}>
          <LucideAlertTriangle size={16} />
          <span className="text-sm">{content || t('errorProcessing', 'An error occurred.')}</span>
        </div>
      );
    }
    
    if (!isUser && !job_status && (status === 'thinking' || status === 'transcribing' || status === 'waiting' || status === 'extracting_audio')) {
      let statusText = t('thinkingStatus', 'Thinking...');
      if (status === 'transcribing') statusText = t('transcribingStatus', 'Transcribing...');
      if (status === 'waiting') statusText = t('waitingStatus', 'Waiting...');
      if (status === 'extracting_audio') statusText = t('extractingAudioStatus', 'Extracting audio...');

      return (
        <div className="flex items-center space-x-2 rtl:space-x-reverse text-gray-500 dark:text-gray-400">
          {status === 'transcribing' && <LucideMic size={16} className="animate-pulse text-blue-500" />}
          <span>{statusText}</span>
          <LoadingIndicator />
        </div>
      );
    }

    return (
      <div className="break-words">
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-4">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ node, ...props }) => <table className="w-full border-collapse border border-gray-300 dark:border-gray-600" {...props} />,
                thead: ({ node, ...props }) => <thead className="bg-gray-50 dark:bg-gray-700/50" {...props} />,
                th: ({ node, ...props }) => <th className="p-2 border border-gray-300 dark:border-gray-600 text-left font-semibold" {...props} />,
                td: ({ node, ...props }) => <td className="p-2 border border-gray-300 dark:border-gray-600" {...props} />,
                a: ({ node, ...props }) => <a className="text-[#6B5CA5] hover:underline" {...props} />,
                // --- THIS IS THE CORRECTED VERSION ---
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  return match ? (
                    <SyntaxHighlighter
                      style={oneDark as any}
                      language={match[1]}
                      PreTag="div"
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
        {status === 'streaming' && !isUser && <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse" />}
      </div>
    );
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-8 group">
        <div className={`flex max-w-[80%] sm:max-w-[70%] md:max-w-[60%] lg:max-w-[55%] flex-row-reverse`}>
          <div className={`flex-shrink-0 ml-2 rtl:mr-2 rtl:ml-0`}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#6B5CA5]">
              <LucideUser size={16} className="text-white" />
            </div>
          </div>
          <div className="flex flex-col rounded-lg px-3 py-2 shadow-sm bg-[#6B5CA5] text-white">
            {renderContent()}
            {/* HIGHLIGHT: Audio player for user messages is now correctly rendered here */}
            {playableAudioUrl && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-grow">
                  <AudioPlayer src={playableAudioUrl} isUserPlayer={true} />
                </div>
                <button
                  onClick={() => handleDownloadAudio(playableAudioUrl)}
                  className="p-2 rounded-full hover:bg-white/20"
                  aria-label="Download audio"
                >
                  <Download size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    // ASSISTANT BUBBLE
    return (
      <div className="flex items-start gap-4 mb-8">
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
          <LucideBot size={16} className="text-[#6B5CA5] dark:text-gray-300" />
        </div>
        <div className="flex-1 -mt-0.5">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Assistant</p>
            {!playableAudioUrl && content && status === MessageStatus.COMPLETE && (
              <button onClick={handlePlayTts} disabled={isTtsLoading} className="p-1 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-[#6B5CA5] disabled:opacity-50 disabled:cursor-wait">
                {isTtsLoading ? (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  <LucideVolume2 size={16} />
                )}
              </button>
            )}
          </div>
          <div className="mt-2 text-gray-900 dark:text-gray-100">
            {/* --- START: ADD THIS BLOCK --- */}
            {/* If a stream is active for this message, show the streaming player */}
            {streamingAudio && streamingAudio.messageId === id ? (
              <StreamingAudioPlayer />
            ) : (
              <>
                {/* Otherwise, show the normal content */}
                {renderContent()}
                {playableAudioUrl && (
                  <div className="mt-2">
                    <AudioPlayer src={playableAudioUrl} isUserPlayer={false} />
                    {/* ... (your download button can go here too) */}
                  </div>
                )}
                                {/* --- START: ADD THIS BLOCK --- */}
                {/* Show Edit button ONLY on completed video messages */}
                {attachment && attachment.fileType.startsWith('video/') && status === MessageStatus.COMPLETE && (
                    <div className="mt-2">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => onEditClick(`Edit this video: `)}
                        >
                            <LucidePenSquare size={16} className="mr-2" />
                            Edit Video
                        </Button>
                    </div>
                )}
                {/* --- END: ADD THIS BLOCK --- */}

              </>
            )}
            {/* --- END: ADD THIS BLOCK --- */}
          </div>
        </div>
      </div>
    );
  }
};

export default ChatMessage;