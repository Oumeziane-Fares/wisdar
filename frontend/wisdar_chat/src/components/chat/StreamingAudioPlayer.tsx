import React, { useEffect, useRef, useState } from 'react';
import { useConversationStore } from '@/store/conversationStore';
import { LucideLoader2 } from 'lucide-react';

const StreamingAudioPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);

  // Get the streaming audio state from our Zustand store
  const streamingAudio = useConversationStore(state => state.streamingAudio);
  
  // Keep track of which chunks we've already added to the buffer
  const [processedChunkCount, setProcessedChunkCount] = useState(0);

  useEffect(() => {
    // 1. Initialize the MediaSource when streaming starts
    if (streamingAudio && streamingAudio.isPlaying && !mediaSourceRef.current) {
      const ms = new MediaSource();
      mediaSourceRef.current = ms;

      ms.addEventListener('sourceopen', () => {
        try {
          // Use 'audio/mpeg' for MP3 files
          const sb = ms.addSourceBuffer('audio/mpeg');
          sourceBufferRef.current = sb;
          // Start playing the audio element
          audioRef.current?.play().catch(e => console.error("Audio play failed:", e));
        } catch (e) {
          console.error("Error adding source buffer:", e);
        }
      });

      if (audioRef.current) {
        audioRef.current.src = URL.createObjectURL(ms);
      }
    }

    // 2. Append new audio chunks as they arrive
    if (streamingAudio && sourceBufferRef.current && !sourceBufferRef.current.updating) {
      const newChunks = streamingAudio.audioChunks.slice(processedChunkCount);
      if (newChunks.length > 0) {
        const combinedBlob = new Blob(newChunks);
        combinedBlob.arrayBuffer().then(buffer => {
          sourceBufferRef.current?.appendBuffer(buffer);
          setProcessedChunkCount(streamingAudio.audioChunks.length);
        });
      }
    }

    // 3. End the stream when the 'isPlaying' flag is set to false
    if (streamingAudio && !streamingAudio.isPlaying && mediaSourceRef.current?.readyState === 'open') {
      mediaSourceRef.current.endOfStream();
    }

  }, [streamingAudio, processedChunkCount]);
  
  // Render the audio element (it can be hidden) and a loading indicator
  if (!streamingAudio) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-gray-100 dark:bg-gray-800">
      <LucideLoader2 className="animate-spin text-[#6B5CA5]" size={20} />
      <span className="text-sm text-muted-foreground">Generating audio...</span>
      <audio ref={audioRef} />
    </div>
  );
};

export default StreamingAudioPlayer;