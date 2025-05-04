import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat, type Message } from 'ai/react';
import { useChatsStore } from '../../../stores/useChatsStore';
import { useAppStore } from "@/stores/useAppStore";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { toast } from "@/hooks/useToast";
import { useLaunchApp, type LaunchAppOptions } from "@/hooks/useLaunchApp";
import { AppId } from "@/config/appIds";
import { appRegistry } from "@/config/appRegistry";

// TODO: Move relevant state and logic from ChatsAppComponent here
// - AI chat state (useChat hook)
// - Message processing (app control markup)
// - System state generation
// - Dialog states (clear, save)

// Replace or update the getSystemState function to use stores
const getSystemState = () => {
    const appStore = useAppStore.getState();
    const ieStore = useInternetExplorerStore.getState();
    const videoStore = useVideoStore.getState();
    const ipodStore = useIpodStore.getState();

    const currentVideo = videoStore.videos[videoStore.currentIndex];
    const currentTrack = ipodStore.tracks[ipodStore.currentIndex];

    const runningApps = Object.entries(appStore.apps)
      .filter(([_, appState]) => appState.isOpen)
      .map(([appId, appState]) => ({ id: appId, isForeground: appState.isForeground || false }));

    const foregroundApp = runningApps.find(app => app.isForeground)?.id || null;
    const backgroundApps = runningApps.filter(app => !app.isForeground).map(app => app.id);

    return {
      apps: appStore.apps,
      runningApps: {
        foreground: foregroundApp,
        background: backgroundApps,
        windowOrder: appStore.windowOrder
      },
      internetExplorer: {
        url: ieStore.url,
        year: ieStore.year,
        status: ieStore.status,
        currentPageTitle: ieStore.currentPageTitle,
        aiGeneratedHtml: ieStore.aiGeneratedHtml,
      },
      video: {
        currentVideo: currentVideo ? { id: currentVideo.id, url: currentVideo.url, title: currentVideo.title, artist: currentVideo.artist } : null,
        isPlaying: videoStore.isPlaying,
        loopAll: videoStore.loopAll,
        loopCurrent: videoStore.loopCurrent,
        isShuffled: videoStore.isShuffled,
      },
      ipod: {
        currentTrack: currentTrack ? { id: currentTrack.id, url: currentTrack.url, title: currentTrack.title, artist: currentTrack.artist } : null,
        isPlaying: ipodStore.isPlaying,
        loopAll: ipodStore.loopAll,
        loopCurrent: ipodStore.loopCurrent,
        isShuffled: ipodStore.isShuffled,
      },
    };
};

export function useAiChat() {
    const { aiMessages, setAiMessages, username } = useChatsStore();
    const launchApp = useLaunchApp();
    const closeApp = useAppStore((state) => state.closeApp);

    // --- AI Chat Hook (Vercel AI SDK) ---
    const {
        messages: currentSdkMessages,
        input,
        handleInputChange,
        handleSubmit: originalHandleSubmit,
        isLoading,
        reload,
        error,
        stop,
        setMessages: setSdkMessages,
        append,
    } = useChat({
        initialMessages: aiMessages, // Initialize from store
        experimental_throttle: 50,
        body: {
            systemState: getSystemState(), // Initial system state
        },
        maxSteps: 5,
        async onToolCall({ toolCall }) {
            try {
                switch (toolCall.toolName) {
                    case "launchApp": {
                        const { id, url, year } = toolCall.args as { id: string; url?: string; year?: string };
                        const appName = appRegistry[id as AppId]?.name || id;
                        console.log("[ToolCall] launchApp:", { id, url, year });
                        
                        const launchOptions: LaunchAppOptions = {};
                        if (id === 'internet-explorer' && (url || year)) {
                            launchOptions.initialData = { url, year: year || 'current' };
                        }
                        
                        launchApp(id as AppId, launchOptions);
                        
                        let confirmationMessage = `Launched ${appName}`;
                        if (id === 'internet-explorer') {
                            const urlPart = url ? ` to ${url}` : '';
                            const yearPart = year && year !== 'current' ? ` in ${year}` : '';
                            confirmationMessage += `${urlPart}${yearPart}`;
                        }
                        return confirmationMessage + ".";
                    }
                    case "closeApp": {
                        const { id } = toolCall.args as { id: string };
                        const appName = appRegistry[id as AppId]?.name || id;
                        console.log("[ToolCall] closeApp:", id);
                        closeApp(id as AppId);
                        return `Closed ${appName}.`;
                    }
                    default:
                        console.warn("Unhandled tool call:", toolCall.toolName);
                        return "";
                }
            } catch (err) {
                console.error("Error executing tool call:", err);
                return `Failed to execute ${toolCall.toolName}`;
            }
        },
        onFinish: () => {
            // Use the ref to get the latest SDK messages when stream finishes
            const finalMessages = currentSdkMessagesRef.current;
            console.log(`AI finished, syncing ${finalMessages.length} final messages to store.`);
            setAiMessages(finalMessages); // Update Zustand with the definitive list from useChat
        },
        onError: (err) => {
            console.error("AI Chat Error:", err);
            toast("AI Error", { description: err.message || "Failed to get response." });
        }
    });

    // Ref to hold the latest SDK messages for use in callbacks
    const currentSdkMessagesRef = useRef<Message[]>([]);
    useEffect(() => {
        currentSdkMessagesRef.current = currentSdkMessages;
    }, [currentSdkMessages]);

    // --- State Synchronization & Message Processing ---
    // Sync store to SDK ONLY on initial load or external store changes
    useEffect(() => {
        // If aiMessages (from store) differs from the SDK state, update SDK.
        // This handles loading persisted messages.
        // Avoid deep comparison issues by comparing lengths and last message ID/content
        if (aiMessages.length !== currentSdkMessages.length ||
            (aiMessages.length > 0 &&
             (aiMessages[aiMessages.length - 1].id !== currentSdkMessages[currentSdkMessages.length - 1]?.id ||
              aiMessages[aiMessages.length - 1].content !== currentSdkMessages[currentSdkMessages.length - 1]?.content)))
        {
            console.log("Syncing Zustand store messages to SDK.");
            setSdkMessages(aiMessages);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aiMessages, setSdkMessages]); // Only run when aiMessages changes

    // --- Action Handlers ---
    const handleSubmit = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const messageContent = input; // Capture input before clearing
            if (!messageContent.trim()) return; // Don't submit empty messages

            // Proceed with the actual submission using useChat
            // useChat's handleSubmit will add the user message to its internal state
            const freshSystemState = getSystemState();
            console.log("Submitting AI chat with system state:", freshSystemState);
            originalHandleSubmit(e, {
                // Pass options correctly - body is a direct property
                body: { systemState: freshSystemState },
            });
        },
        [originalHandleSubmit, input] // Removed setAiMessages, aiMessages from deps
    );

    const handleDirectMessageSubmit = useCallback(
        (message: string) => {
            if (!message.trim()) return; // Don't submit empty messages

            // Proceed with the actual submission using useChat
            // useChat's append will add the user message to its internal state
            console.log("Appending direct message to AI chat");
            append(
                { content: message, role: "user" }, // append only needs content/role
                { body: { systemState: getSystemState() } } // Pass options correctly - body is direct property
            );
        },
        [append] // Removed setAiMessages, aiMessages from deps
    );

    const handleNudge = useCallback(() => {
        handleDirectMessageSubmit("👋 *nudge sent*");
        // Consider adding shake effect trigger here if needed
    }, [aiMessages, username]);

    const clearChats = useCallback(() => {
        console.log("Clearing AI chats");
        // Define the initial message
        const initialMessage: Message = {
            id: "1", // Ensure consistent ID for the initial message
            role: "assistant",
            content: "👋 hey! i'm ryo. ask me anything!",
            createdAt: new Date(),
        };
        // Update both the Zustand store and the SDK state directly
        setAiMessages([initialMessage]);
        setSdkMessages([initialMessage]);
    }, [setAiMessages, setSdkMessages]);

    // --- Dialog States & Handlers ---
    const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [saveFileName, setSaveFileName] = useState("");

    const confirmClearChats = useCallback(() => {
        setIsClearDialogOpen(false);
        // Add small delay for dialog close animation
        setTimeout(() => {
            clearChats();
            handleInputChange({ target: { value: "" } } as React.ChangeEvent<HTMLInputElement>); // Clear input field
        }, 100);
    }, [clearChats, handleInputChange]);

    const handleSaveTranscript = useCallback(() => {
        const now = new Date();
        const date = now.toISOString().split("T")[0];
        const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase().replace(":", "-").replace(" ", "");
        setSaveFileName(`chat-${date}-${time}.md`);
        setIsSaveDialogOpen(true);
    }, []);

    const handleSaveSubmit = useCallback((fileName: string) => {
        const transcript = aiMessages // Use messages from store
            .map((msg: Message) => {
                const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
                const sender = msg.role === 'user' ? (username || 'You') : 'Ryo';
                return `**${sender}** (${time}):\n${msg.content}`;
            })
            .join("\n\n");

        const finalFileName = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
        const filePath = `/Documents/${finalFileName}`;

        const saveEvent = new CustomEvent("saveFile", {
            detail: { name: finalFileName, path: filePath, content: transcript, icon: "/icons/file-text.png", isDirectory: false },
        });
        window.dispatchEvent(saveEvent);

        // Update TextEditStore
        const textEditStore = useTextEditStore.getState();
        textEditStore.setLastFilePath(null);
        setIsSaveDialogOpen(false);

        toast.success("Transcript saved", {
            description: `Saved to ${finalFileName}`,
            duration: 3000,
        });
    }, [aiMessages, username]);

    return {
        // AI Chat State & Actions
        messages: currentSdkMessages, // <-- Return messages from useChat directly
        input,
        handleInputChange,
        handleSubmit,
        isLoading,
        reload,
        error,
        stop,
        append,
        handleDirectMessageSubmit,
        handleNudge,
        clearChats, // Expose the action
        handleSaveTranscript, // Expose the action

        // Dialogs
        isClearDialogOpen,
        setIsClearDialogOpen,
        confirmClearChats,

        isSaveDialogOpen,
        setIsSaveDialogOpen,
        saveFileName,
        setSaveFileName,
        handleSaveSubmit,
    };
} 