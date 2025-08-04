// src/components/chat/ImageViewer.tsx

import React from 'react';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageViewerProps {
  src: string;
  onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ src, onClose }) => {
  // Stop the event from propagating to the backdrop and closing the modal
  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleDownload = async () => {
    try {
      // Fetch the image data
      const response = await fetch(src);
      const blob = await response.blob();
      
      // Create a temporary link element to trigger the download
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `wisdar-image-${Date.now()}.png`; // Or derive from URL
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href); // Clean up the object URL
    } catch (error) {
      console.error("Failed to download image:", error);
      // You might want to show a toast notification here
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Action Buttons */}
      <div className="absolute top-4 right-4 flex gap-2">
        <Button variant="ghost" size="icon" onClick={handleDownload} className="text-white hover:bg-white/20 hover:text-white">
          <Download size={24} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 hover:text-white">
          <X size={24} />
        </Button>
      </div>
      
      {/* Image Container */}
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={handleContentClick}>
        <img
          src={src}
          alt="Enlarged view"
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>
    </div>
  );
};

export default ImageViewer;