import React from 'react';
import { useConversationStore } from '@/store/conversationStore';
import { AiService } from '@/types';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface VideoOptionsProps {
  selectedService: AiService;
}

const VideoOptions: React.FC<VideoOptionsProps> = ({ selectedService }) => {
  const { videoAspectRatio, setVideoAspectRatio } = useConversationStore();

  const availableRatios = selectedService.capabilities?.aspect_ratios || [];

  React.useEffect(() => {
    // Automatically select the first available aspect ratio as the default
    if (availableRatios.length > 0 && !videoAspectRatio) {
      setVideoAspectRatio(availableRatios[0]);
    }
  }, [availableRatios, videoAspectRatio, setVideoAspectRatio]);

  // If there are no aspect ratios to choose from, don't render anything
  if (availableRatios.length === 0) {
    return null;
  }

  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-3 bg-gray-50 dark:bg-gray-800/50">
      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Video Options</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="aspect-ratio">Aspect Ratio</Label>
          <Select
            value={videoAspectRatio || ''}
            onValueChange={(value) => setVideoAspectRatio(value)}
          >
            <SelectTrigger id="aspect-ratio">
              <SelectValue placeholder="Select ratio..." />
            </SelectTrigger>
            <SelectContent>
              {availableRatios.map((ratio) => (
                <SelectItem key={ratio} value={ratio}>
                  {ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default VideoOptions;