import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface YouTubeSettings {
  url: string;
  startTime: string;
  endTime: string;
  fps: number;
}

interface YouTubeSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: YouTubeSettings) => void;
  initialSettings: YouTubeSettings | null;
}

const YouTubeSettingsDialog: React.FC<YouTubeSettingsDialogProps> = ({ isOpen, onClose, onSave, initialSettings }) => {
  const [settings, setSettings] = useState<YouTubeSettings>({
    url: '',
    startTime: '',
    endTime: '',
    fps: 1,
  });

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings]);

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Video settings</DialogTitle>
          <DialogDescription>
            Provide details for the YouTube video analysis.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="url" className="text-right">YouTube URL</Label>
            <Input id="url" value={settings.url} onChange={(e) => setSettings({ ...settings, url: e.target.value })} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="start" className="text-right">Start Time</Label>
            <Input id="start" placeholder="e.g., 1m10s" value={settings.startTime} onChange={(e) => setSettings({ ...settings, startTime: e.target.value })} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="end" className="text-right">End Time</Label>
            <Input id="end" placeholder="e.g., 2m30s" value={settings.endTime} onChange={(e) => setSettings({ ...settings, endTime: e.target.value })} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="fps" className="text-right">FPS</Label>
            <Input id="fps" type="number" value={settings.fps} onChange={(e) => setSettings({ ...settings, fps: parseInt(e.target.value, 10) || 1 })} className="col-span-3" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default YouTubeSettingsDialog;