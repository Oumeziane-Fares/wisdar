import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { LucidePlay, LucidePause } from 'lucide-react';

// 1. UPDATE THE PROPS INTERFACE
interface AudioPlayerProps {
  src: string;
  isUserPlayer?: boolean; // Add the new optional prop
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, isUserPlayer = false }) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState('0:00');
  const [duration, setDuration] = useState('0:00');

  const formatTime = (seconds: number) => {
    const date = new Date(seconds * 1000);
    const minutes = date.getUTCMinutes();
    const secs = date.getUTCSeconds().toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  };

  useEffect(() => {
    if (!waveformRef.current) return;

    // 2. USE THE NEW PROP TO SET DYNAMIC COLORS
    const waveColor = isUserPlayer ? '#A99EDA' : '#d1d5db'; // Lighter purple for user, gray for assistant
    const progressColor = isUserPlayer ? '#FFFFFF' : '#6B5CA5'; // White for user, main purple for assistant

    wavesurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: waveColor,
      progressColor: progressColor,
      cursorWidth: 1,
      cursorColor: isUserPlayer ? '#FFFFFF' : '#333',
      barWidth: 3,
      barRadius: 3,
      height: 40,
    });

    if (src) {
      wavesurfer.current.load(src);
    }

    wavesurfer.current.on('ready', () => {
      if (wavesurfer.current) setDuration(formatTime(wavesurfer.current.getDuration()));
    });
    wavesurfer.current.on('audioprocess', () => {
      if (wavesurfer.current) setCurrentTime(formatTime(wavesurfer.current.getCurrentTime()));
    });
    wavesurfer.current.on('play', () => setIsPlaying(true));
    wavesurfer.current.on('pause', () => setIsPlaying(false));
    wavesurfer.current.on('finish', () => setIsPlaying(false));

    return () => {
      wavesurfer.current?.destroy();
    };
  }, [src, isUserPlayer]); // Add isUserPlayer to the dependency array

  const handlePlayPause = () => {
    wavesurfer.current?.playPause();
  };

  return (
    <div className="custom-audio-player">
      {/* 3. USE THE PROP TO STYLE THE BUTTON AND TEXT */}
      <button onClick={handlePlayPause} className={`play-pause-button ${isUserPlayer ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
        {isPlaying ? <LucidePause size={20} /> : <LucidePlay size={20} />}
      </button>
      <div ref={waveformRef} className="waveform-container" />
      <div className={`time-display ${isUserPlayer ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
        {currentTime} / {duration}
      </div>
    </div>
  );
};

export default AudioPlayer;