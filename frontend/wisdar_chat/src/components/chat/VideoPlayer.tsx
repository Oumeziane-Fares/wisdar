import React from 'react';
import './VideoPlayer.css'; // The CSS now controls everything

interface VideoPlayerProps {
  src: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src }) => {
  if (!src) {
    return null;
  }

  // The video tag is now simpler because the CSS handles its size and position.
  return (
    <div className='player-wrapper'>
      <video src={src} controls crossOrigin="anonymous" />
    </div>
  );
};

export default VideoPlayer;
