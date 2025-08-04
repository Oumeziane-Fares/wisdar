import React from 'react';
import { Button } from '@/components/ui/button';
import { FileVideo, Image as ImageIcon, FileAudio, File, X } from 'lucide-react';

interface AttachmentPreviewProps {
  files: File[];
  onRemove: (fileToRemove: File) => void;
}

const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <ImageIcon size={16} />;
    if (fileType.startsWith('video/')) return <FileVideo size={16} />;
    if (fileType.startsWith('audio/')) return <FileAudio size={16} />;
    return <File size={16} />;
};

const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({ files, onRemove }) => {
  if (files.length === 0) return null;

  const file = files[0]; // We'll just preview the first file for now

  return (
    <div className="flex justify-start">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-full px-3 py-1.5">
            {getFileIcon(file.type)}
            <span className="truncate max-w-[250px]">{file.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-full text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
              onClick={() => onRemove(file)}
            >
                <X size={16} />
            </Button>
        </div>
    </div>
  );
};

export default AttachmentPreview;