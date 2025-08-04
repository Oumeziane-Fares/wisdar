// src/components/chat/ModelSelectorPopover.tsx

import React, { useState, useMemo, useEffect } from 'react'; // Import useEffect
import { useConversationStore } from '@/store/conversationStore';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, MessageSquare, Image as ImageIcon, Video, MicVocal, Search, Volume2, FileVideo  } from 'lucide-react';
import { cn } from '@/lib/utils';

// Define our core services and their icons for the tabs (Unchanged)
const coreServiceTypes = [
  { id: 'chat', name: 'Chat', icon: MessageSquare },
  { id: 'chat-search', name: 'Web Chat', icon: Search },
  { id: 'image', name: 'Image', icon: ImageIcon },
  { id: 'video', name: 'Video', icon: Video },
  { id: 'transcription', name: 'Transcription', icon: MicVocal },
  { id: 'tts', name: 'TTS', icon: Volume2 }, // <-- ADD THIS LINE
  { id: 'video-understanding', name: 'Video Q&A', icon: FileVideo  }, // <-- ADD THIS LINE
];

// --- ADD THE NEW DISABLED PROP ---
interface ModelSelectorPopoverProps {
  disabled?: boolean;
  onSelect?: () => void; // <-- ADD THIS LINE
}

const ModelSelectorPopover: React.FC<ModelSelectorPopoverProps> = ({ disabled = false, onSelect }) => {
  const {
    providers,
    activeProviderServiceId,
    setSelectedProvider,
    setActiveProviderService,
  } = useConversationStore();

  const [isOpen, setIsOpen] = useState(false);
  // --- NEW STATE FOR CONTROLLING THE TABS ---
  const [activeTab, setActiveTab] = useState('chat');

  // --- FIX: Find the active service using the unique providerServiceId ---
  const activeService = useMemo(() => {
    for (const provider of providers) {
      const service = provider.services.find(s => s.providerServiceId === activeProviderServiceId);
      if (service) return service;
    }
    return null;
  }, [providers, activeProviderServiceId]);
  
  // --- NEW EFFECT TO SET THE CORRECT TAB WHEN OPENING ---
  useEffect(() => {
    if (isOpen && activeService) {
      // When the popover opens, set the active tab to match the current service's type
      setActiveTab(activeService.id);
    }
  }, [isOpen, activeService]);

  const modelsByService = useMemo(() => {
    // ... (This logic is unchanged from the last fix)
    const grouped: { [key: string]: any[] } = {};
    coreServiceTypes.forEach(serviceType => { grouped[serviceType.id] = []; });
    providers.forEach(provider => {
      provider.services.forEach(service => {
        if (grouped[service.id]) {
          grouped[service.id].push({ ...service, providerId: provider.id });
        }
      });
    });
    return grouped;
  }, [providers]);

  const handleSelectModel = (providerId: string, providerServiceId: number) => {
    setSelectedProvider(providerId); // This can stay to set the provider context
    setActiveProviderService(providerServiceId); // Set the specific service
    setIsOpen(false);
     onSelect?.();
  };


  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={isOpen}
          className="min-w-[150px] justify-between h-9"
          // --- USE THE NEW DISABLED PROP HERE ---
          disabled={disabled}
        >
          <div className="flex items-center gap-2">
            <span className="truncate">{activeService ? activeService.name : "Select model"}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" side="top" align="end">
        {/* --- BIND THE TABS TO OUR NEW STATE --- */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 h-auto p-1">
            {coreServiceTypes.map(service => (
              <TabsTrigger key={service.id} value={service.id} className="flex flex-col gap-1 h-full py-2 px-1 text-xs">
                 <service.icon size={18}/>
                 {service.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {coreServiceTypes.map(service => (
            <TabsContent key={service.id} value={service.id}>
              <Command>
                <CommandList>
                  <CommandGroup heading={`${service.name} Models`}>
                    {modelsByService[service.id]?.map(model => (
                      <CommandItem
                        key={model.providerServiceId}
                        value={`${model.providerServiceId}`} // Use a string value for the command item
                        // --- FIX: Call the updated handler ---
                        onSelect={() => handleSelectModel(model.providerId, model.providerServiceId)}
                        className="flex justify-between items-center"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{model.modelId}</span>
                        </div>
                        {/* --- FIX: Check for selection using the unique providerServiceId --- */}
                        <Check
                          className={cn("h-4 w-4", activeProviderServiceId === model.providerServiceId ? "opacity-100" : "opacity-0")}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </TabsContent>
          ))}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};

export default ModelSelectorPopover;