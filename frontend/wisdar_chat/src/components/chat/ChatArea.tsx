// src/components/chat/ChatArea.tsx

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Message, Agent} from '@/types';
import ChatMessage from '@/components/chat/ChatMessage';
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversationStore } from '@/store/conversationStore';
import ImageViewer from './ImageViewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LucideMic, LucideStopCircle, Check, Languages, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supportedLanguages, Language } from '@/lib/languages';
import { toast } from "sonner";
import { authFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import AttachmentPreview from './AttachmentPreview';
import YouTubeSettingsDialog from './YouTubeSettingsDialog';

// --- NEW: Import our new components ---
import EmptyChatView from './EmptyChatView';
import UnifiedInput from './UnifiedInput';

// --- Date Formatting Helper Function (Unchanged) ---
const formatDateSeparator = (date: Date, t: any, i18n: any) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return t('dateSeparatorToday', 'Today');
    if (date.toDateString() === yesterday.toDateString()) return t('dateSeparatorYesterday', 'Yesterday');
    return date.toLocaleDateString(i18n.language, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

interface ChatAreaProps {
    conversationTitle: string;
    messages: Message[];
    onSendMessage: (content: string, attachments?: File[], language?: string) => void;
    isExistingConversation: boolean;
}
interface YouTubeSettings {
  url: string;
  startTime: string;
  endTime: string;
  fps: number;
}
// NOTE: forwardRef is removed as it's no longer needed for the new design
const ChatArea: React.FC<ChatAreaProps> = ({
    conversationTitle,
    messages,
    onSendMessage,
    isExistingConversation,
}) => {
    const { t, i18n } = useTranslation();
    const [inputValue, setInputValue] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [stagedFiles, setStagedFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioStreamRef = useRef<MediaStream | null>(null);
    const [languageSelectorOpen, setLanguageSelectorOpen] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState<Language>(supportedLanguages[0]);
    const { activeAgent, setActiveAgent, youtubeAgentSettings, setYoutubeAgentSettings } = useConversationStore();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);
    const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);

    const [isYouTubeSettingsOpen, setIsYouTubeSettingsOpen] = useState(false);
    // Apply the type to the 'settings' parameter
    const handleSaveYouTubeSettings = (settings: YouTubeSettings) => {
        setYoutubeAgentSettings(settings);
    };
    // --- All useEffect hooks from the original file are preserved ---
    useEffect(() => {
        const isAssistantResponding = messages.some(
            (msg) => msg.role === 'assistant' && ['thinking', 'streaming', 'transcribing'].includes(msg.status!)
        );
        setIsLoading(isAssistantResponding);
    }, [messages]);

    const scrollToBottom = (behavior: "smooth" | "auto" = "smooth") => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    };

    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        const isStreaming = lastMessage?.role === 'assistant' && lastMessage.status === 'streaming';
        if (isStreaming) {
            scrollToBottom('auto');
        } else {
            const timer = setTimeout(() => scrollToBottom('smooth'), 100);
            return () => clearTimeout(timer);
        }
    }, [messages, conversationTitle]);

    useEffect(() => {
        return () => {
            if (audioStreamRef.current) {
                audioStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
        };
    }, []);

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const response = await authFetch('/agents');
                if (!response.ok) throw new Error('Failed to fetch agents.');
                setAgents(await response.json());
            } catch (error) { toast.error("Could not load AI Agents."); }
        };
        fetchAgents();
    }, []);

    // --- All handler functions from the original file are preserved or adapted ---
    const handleEditClick = (text: string) => { setInputValue(text); };
    const handleImageClick = (url: string) => { setEnlargedImageUrl(url); };
    const handleSelectAgent = (agent: Agent) => { setActiveAgent(agent); setIsAgentDialogOpen(false); };
    const handleAttachmentClick = () => { if (!isRecording) fileInputRef.current?.click(); };

    const handleSendMessage = () => {
        // Check for staged files OR text input
        if ((!inputValue.trim() && stagedFiles.length === 0) || isRecording) {
            return;
        }
        
        // Use the main onSendMessage prop, now including the staged files
        onSendMessage(inputValue, stagedFiles);
        
        // Clear the input and the staged files after sending
        setInputValue('');
        setStagedFiles([]);
    };
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            // Stage the selected files instead of sending immediately
            setStagedFiles(Array.from(files));
            
            // Clear the input so the same file can be selected again if removed
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const startRecording = async (language: Language) => {
        // This function's logic is preserved exactly as it was in your original file
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast.error("Oops! Your browser doesn't allow audio recording.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioStreamRef.current = stream;
            const options = { mimeType: 'audio/webm;codecs=opus' };
            mediaRecorderRef.current = MediaRecorder.isTypeSupported(options.mimeType) ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
            const recorder = mediaRecorderRef.current;
            audioChunksRef.current = [];
            recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                const fileExtension = recorder.mimeType?.split('/')[1]?.split(';')[0] || 'webm';
                const audioFile = new File([audioBlob], `recorded_voice_${Date.now()}.${fileExtension}`, { type: audioBlob.type });
                onSendMessage(t('voiceNoteSent', 'Voice Note'), [audioFile], language.code);
                setIsRecording(false);
                if (audioStreamRef.current) {
                    audioStreamRef.current.getTracks().forEach(track => track.stop());
                    audioStreamRef.current = null;
                }
            };
            recorder.start();
            setIsRecording(true);
            setLanguageSelectorOpen(false); // Close popover on start
        } catch (err) {
            console.error("Error accessing microphone:", err);
            toast.error("Microphone access denied.", { description: "Please allow microphone access in your browser settings." });
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    };

    const handleRecordVoiceClick = () => {
        if (isRecording) {
            stopRecording();
        } else {
            setLanguageSelectorOpen(true);
        }
    };
    
    const handlePromptClick = (prompt: { text: string, action?: string }) => {
        if (prompt.action === 'trigger_upload') {
            handleAttachmentClick();
        } else {
            setInputValue(prompt.text);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background text-foreground">
            {/* Hidden file input for attachments */}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="audio/*,video/*,image/*" />

            {/* Main Content & Message List */}
            <ScrollArea className="flex-1">
                <div className="max-w-4xl mx-auto space-y-4 px-4 sm:px-6 lg:px-8 pb-6">
                    {messages.length === 0 ? (
                        <EmptyChatView onPromptClick={handlePromptClick} />
                    ) : (
                        messages.map((message, index) => {
                             const currentMessageDate = new Date(message.timestamp);
                             const previousMessage = messages[index - 1];
                             const previousMessageDate = previousMessage ? new Date(previousMessage.timestamp) : null;
                             const showDateSeparator = !previousMessageDate || currentMessageDate.toDateString() !== previousMessageDate.toDateString();
                             
                             return (
                                <React.Fragment key={String(message.id)}>
                                    {showDateSeparator && (
                                        <div className="relative py-4">
                                            <div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t border-border" /></div>
                                            <div className="relative flex justify-center"><span className="bg-background px-2 text-xs text-muted-foreground">{formatDateSeparator(currentMessageDate, t, i18n)}</span></div>
                                        </div>
                                    )}
                                    <ChatMessage {...message} onImageClick={handleImageClick} onSendMessage={onSendMessage} onEditClick={handleEditClick} />
                                </React.Fragment>
                            );
                        })
                    )}
                </div>
                <div ref={messagesEndRef} />
            </ScrollArea>

            {/* --- Bottom Input Area --- */}
            <div className="p-2 border-t">
                
                {/* --- Correct Placement for Attachment Preview --- */}
                {stagedFiles.length > 0 && (
                    <div className="px-2 pb-2">
                        <AttachmentPreview
                            files={stagedFiles}
                            onRemove={() => setStagedFiles([])}
                        />
                    </div>
                )}
                
                {/* Container for buttons and the main input component */}
                <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="icon" onClick={() => setIsAgentDialogOpen(true)} className="p-2" disabled={isLoading}><Bot size={20} /></Button>
                    
                    <Popover open={languageSelectorOpen} onOpenChange={setLanguageSelectorOpen}>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" onClick={handleRecordVoiceClick} disabled={isLoading} className={cn("relative p-2", isRecording && 'text-red-500 animate-pulse')} aria-label={isRecording ? 'stop recording' : 'record voice'}>
                                {isRecording ? <LucideStopCircle size={20} /> : <><LucideMic size={20} /><Languages className="absolute h-4 w-4 -bottom-0.5 -right-0.5 text-muted-foreground bg-background rounded-full p-0.5" /></>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder={'Select language...'} />
                                <CommandList>
                                    <CommandEmpty>{'No language found.'}</CommandEmpty>
                                    <CommandGroup>
                                        {supportedLanguages.map((lang) => (<CommandItem key={lang.code} value={lang.name} onSelect={() => setSelectedLanguage(lang)}><Check className={cn("mr-2 h-4 w-4", selectedLanguage.code === lang.code ? "opacity-100" : "opacity-0")} />{lang.name}</CommandItem>))}
                                    </CommandGroup>
                                </CommandList>
                                <div className="p-2 border-t">
                                    <Button onClick={() => startRecording(selectedLanguage)} className="w-full bg-[#6B5CA5] hover:bg-[#5d4f91]"><LucideMic className="mr-2 h-4 w-4" />{'Start Recording'}</Button>
                                </div>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    
                    <UnifiedInput
                      inputValue={inputValue}
                      setInputValue={setInputValue}
                      onSendMessage={handleSendMessage}
                      onAttachmentClick={handleAttachmentClick}
                      isInputDisabled={isLoading || isRecording}
                      activeAgent={activeAgent}
                      onClearAgent={() => setActiveAgent(null)}
                      isExistingConversation={isExistingConversation}
                      onOpenYouTubeSettings={() => setIsYouTubeSettingsOpen(true)}
                    />
                </div>
            </div>
            
            {/* --- Modals & Dialogs --- */}

                  {activeAgent?.name === 'YouTube Summary' && (
                    <YouTubeSettingsDialog
                    isOpen={isYouTubeSettingsOpen}
                    onClose={() => setIsYouTubeSettingsOpen(false)}
                    onSave={handleSaveYouTubeSettings}
                    initialSettings={youtubeAgentSettings}
                    />
                )}
            {enlargedImageUrl && (<ImageViewer src={enlargedImageUrl} onClose={() => setEnlargedImageUrl(null)} />)}

            <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Select an AI Agent</DialogTitle>
                        <DialogDescription>Choose a specialized agent for your task.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-4 max-h-[60vh] overflow-y-auto">
                        {agents.map(agent => (
                            <Card key={agent.id} className="cursor-pointer hover:bg-accent" onClick={() => handleSelectAgent(agent)}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-md"><Bot size={18} /> {agent.name}</CardTitle>
                                    <CardDescription className="text-xs">{agent.description}</CardDescription>
                                </CardHeader>
                            </Card>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );

};

export default ChatArea;