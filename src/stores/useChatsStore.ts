import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type Message } from "ai/react";
import { type ChatRoom, type ChatMessage } from "@/types/chat";

// Define the state structure
export interface ChatsStoreState {
    // AI Chat State
    aiMessages: Message[];
    // Room State
    username: string | null;
    rooms: ChatRoom[];
    currentRoomId: string | null; // ID of the currently selected room, null for AI chat (@ryo)
    roomMessages: Record<string, ChatMessage[]>; // roomId -> messages map
    // UI State
    isSidebarVisible: boolean;
    fontSize: number; // Add font size state

    // Actions
    setAiMessages: (messages: Message[]) => void;
    setUsername: (username: string | null) => void;
    setRooms: (rooms: ChatRoom[]) => void;
    setCurrentRoomId: (roomId: string | null) => void;
    setRoomMessagesForCurrentRoom: (messages: ChatMessage[]) => void; // Sets messages for the *current* room
    addMessageToRoom: (roomId: string, message: ChatMessage) => void;
    removeMessageFromRoom: (roomId: string, messageId: string) => void;
    clearRoomMessages: (roomId: string) => void; // Clears messages for a specific room
    toggleSidebarVisibility: () => void;
    setFontSize: (size: number | ((prevSize: number) => number)) => void; // Add font size action
    reset: () => void; // Reset store to initial state
}

const initialAiMessage: Message = {
    id: "1",
    role: "assistant",
    content: "👋 hey! i'm ryo. ask me anything!",
    createdAt: new Date(),
};

const getInitialState = (): Omit<ChatsStoreState, 'isAdmin' | 'reset' | 'setAiMessages' | 'setUsername' | 'setRooms' | 'setCurrentRoomId' | 'setRoomMessagesForCurrentRoom' | 'addMessageToRoom' | 'removeMessageFromRoom' | 'clearRoomMessages' | 'toggleSidebarVisibility' | 'setFontSize'> => ({
    aiMessages: [initialAiMessage],
    username: null,
    rooms: [],
    currentRoomId: null,
    roomMessages: {},
    isSidebarVisible: true,
    fontSize: 13, // Default font size
});

const STORE_VERSION = 2;
const STORE_NAME = "ryos:chats";

export const useChatsStore = create<ChatsStoreState>()(
    persist(
        (set, get) => ({
            ...getInitialState(),

            // --- Actions ---
            setAiMessages: (messages) => set({ aiMessages: messages }),
            setUsername: (username) => set({ username }),
            setRooms: (newRooms) => {
                // Ensure incoming data is an array
                if (!Array.isArray(newRooms)) {
                  console.warn("[ChatsStore] Attempted to set rooms with a non-array value:", newRooms);
                  return; // Ignore non-array updates
                }

                // Deep comparison to prevent unnecessary updates
                const currentRooms = get().rooms;
                if (JSON.stringify(currentRooms) === JSON.stringify(newRooms)) {
                    console.log("[ChatsStore] setRooms skipped: newRooms are identical to current rooms.");
                    return; // Skip update if rooms haven't actually changed
                }

                console.log("[ChatsStore] setRooms called. Updating rooms.");
                set({ rooms: newRooms });
            },
            setCurrentRoomId: (roomId) => set({ currentRoomId: roomId }),
            setRoomMessagesForCurrentRoom: (messages) => {
                const currentRoomId = get().currentRoomId;
                if (currentRoomId) {
                    set((state) => ({
                        roomMessages: {
                            ...state.roomMessages,
                            [currentRoomId]: messages.sort((a, b) => a.timestamp - b.timestamp),
                        },
                    }));
                }
            },
            addMessageToRoom: (roomId, message) => {
                set((state) => {
                    const existingMessages = state.roomMessages[roomId] || [];
                    // Avoid duplicates from Pusher echos or optimistic updates
                    if (existingMessages.some(m => m.id === message.id)) {
                        return {}; // No change needed
                    }
                    // Handle potential replacement of temp message ID if server ID matches
                    const tempIdPattern = /^temp_/; // Or use the actual temp ID if passed
                    const messagesWithoutTemp = existingMessages.filter(m => !(tempIdPattern.test(m.id) && m.content === message.content && m.username === message.username));

                    return {
                        roomMessages: {
                            ...state.roomMessages,
                            [roomId]: [...messagesWithoutTemp, message].sort((a, b) => a.timestamp - b.timestamp),
                        },
                    };
                });
            },
            removeMessageFromRoom: (roomId, messageId) => {
                set((state) => {
                    const existingMessages = state.roomMessages[roomId] || [];
                    const updatedMessages = existingMessages.filter(m => m.id !== messageId);
                    // Only update if a message was actually removed
                    if (updatedMessages.length < existingMessages.length) {
                        return {
                            roomMessages: {
                                ...state.roomMessages,
                                [roomId]: updatedMessages,
                            },
                        };
                    }
                    return {}; // No change needed
                });
            },
            clearRoomMessages: (roomId) => {
                 set((state) => ({
                    roomMessages: {
                        ...state.roomMessages,
                        [roomId]: [],
                    },
                }));
            },
            toggleSidebarVisibility: () => set((state) => ({
                 isSidebarVisible: !state.isSidebarVisible
            })),
            setFontSize: (sizeOrFn) => set((state) => ({
                fontSize: typeof sizeOrFn === 'function' ? sizeOrFn(state.fontSize) : sizeOrFn
            })),
            reset: () => set(getInitialState()),
        }),
        {
            name: STORE_NAME,
            version: STORE_VERSION,
            storage: createJSONStorage(() => localStorage), // Use localStorage
            partialize: (state) => ({
                // Select properties to persist
                aiMessages: state.aiMessages,
                username: state.username,
                currentRoomId: state.currentRoomId,
                isSidebarVisible: state.isSidebarVisible,
                rooms: state.rooms, // Persist rooms list
                roomMessages: state.roomMessages, // Persist room messages cache
                fontSize: state.fontSize, // Persist font size
            }),
            // --- Migration from old localStorage keys ---
            migrate: (persistedState, version) => {
                console.log("[ChatsStore] Migrate function started. Version:", version, "Persisted state exists:", !!persistedState);
                if (persistedState) {
                  console.log("[ChatsStore] Persisted state type for rooms:", typeof (persistedState as ChatsStoreState).rooms, "Is Array:", Array.isArray((persistedState as ChatsStoreState).rooms));
                }

                if (version < STORE_VERSION && !persistedState) {
                    console.log(`[ChatsStore] Migrating from old localStorage keys to version ${STORE_VERSION}...`);
                    try {
                        const migratedState: Partial<ChatsStoreState> = {};

                        // Migrate AI Messages
                        const oldAiMessagesRaw = localStorage.getItem('chats:messages');
                        if (oldAiMessagesRaw) {
                            try {
                                migratedState.aiMessages = JSON.parse(oldAiMessagesRaw);
                            } catch (e) { console.warn("Failed to parse old AI messages during migration", e); }
                        }

                        // Migrate Username
                        const oldUsernameKey = 'chats:chatRoomUsername'; // Define old key
                        const oldUsername = localStorage.getItem(oldUsernameKey);
                        if (oldUsername) {
                            migratedState.username = oldUsername;
                            localStorage.removeItem(oldUsernameKey); // Remove here during primary migration
                            console.log(`[ChatsStore] Migrated and removed '${oldUsernameKey}' key during version upgrade.`);
                        }

                        // Migrate Last Opened Room ID
                        const oldCurrentRoomId = localStorage.getItem('chats:lastOpenedRoomId');
                        if (oldCurrentRoomId) migratedState.currentRoomId = oldCurrentRoomId;

                        // Migrate Sidebar Visibility
                        const oldSidebarVisibleRaw = localStorage.getItem('chats:sidebarVisible');
                        if (oldSidebarVisibleRaw) {
                            // Check if it's explicitly "false", otherwise default to true (initial state)
                            migratedState.isSidebarVisible = oldSidebarVisibleRaw !== 'false';
                        }

                        // Migrate Cached Rooms
                        const oldCachedRoomsRaw = localStorage.getItem('chats:cachedRooms');
                        if (oldCachedRoomsRaw) {
                            try {
                                migratedState.rooms = JSON.parse(oldCachedRoomsRaw);
                            } catch (e) { console.warn("Failed to parse old cached rooms during migration", e); }
                        }

                        // Migrate Cached Room Messages
                        const oldCachedRoomMessagesRaw = localStorage.getItem('chats:cachedRoomMessages'); // Assuming this key
                        if (oldCachedRoomMessagesRaw) {
                             try {
                                migratedState.roomMessages = JSON.parse(oldCachedRoomMessagesRaw);
                            } catch (e) { console.warn("Failed to parse old cached room messages during migration", e); }
                        }

                        console.log("[ChatsStore] Migration data:", migratedState);

                        // Clean up old keys (Optional - uncomment if desired after confirming migration)
                        // localStorage.removeItem('chats:messages');
                        // localStorage.removeItem('chats:lastOpenedRoomId');
                        // localStorage.removeItem('chats:sidebarVisible');
                        // localStorage.removeItem('chats:cachedRooms');
                        // localStorage.removeItem('chats:cachedRoomMessages');
                        // console.log("[ChatsStore] Old localStorage keys potentially removed.");

                        const finalMigratedState = { ...getInitialState(), ...migratedState } as ChatsStoreState;
                        console.log("[ChatsStore] Final migrated state:", finalMigratedState);
                        console.log("[ChatsStore] Migrated rooms type:", typeof finalMigratedState.rooms, "Is Array:", Array.isArray(finalMigratedState.rooms));
                        return finalMigratedState;
                    } catch (e) {
                        console.error("[ChatsStore] Migration failed:", e);
                    }
                }
                // If persistedState exists, use it (already in new format or newer version)
                if (persistedState) {
                     console.log("[ChatsStore] Using persisted state.");
                     const state = persistedState as ChatsStoreState;
                     const finalState = { ...state };
                     
                     console.log("[ChatsStore] Final state from persisted:", finalState);
                     console.log("[ChatsStore] Persisted state rooms type:", typeof finalState.rooms, "Is Array:", Array.isArray(finalState.rooms));
                     return finalState;
                }
                // Fallback to initial state if migration fails or no persisted state
                console.log("[ChatsStore] Falling back to initial state.");
                return { ...getInitialState() } as ChatsStoreState;
            },
            // --- Rehydration Check for Null Username ---
            onRehydrateStorage: () => {
              console.log("[ChatsStore] Rehydrating storage...");
              return (state, error) => {
                if (error) {
                  console.error("[ChatsStore] Error during rehydration:", error);
                } else if (state) {
                  console.log("[ChatsStore] Rehydration complete. Current state username:", state.username);
                  // Check if username is null AFTER rehydration
                  if (state.username === null) {
                    const oldUsernameKey = "chats:chatRoomUsername"; // Define the old key
                    const oldUsername = localStorage.getItem(oldUsernameKey);
                    if (oldUsername) {
                      console.log(`[ChatsStore] Found old username '${oldUsername}' in localStorage during rehydration check. Applying.`);
                      state.username = oldUsername; // Modify the state object directly before it's set
                      localStorage.removeItem(oldUsernameKey); // Clean up the old key
                      console.log(`[ChatsStore] Removed old key '${oldUsernameKey}' after rehydration fix.`);
                    } else {
                        console.log("[ChatsStore] Username is null, but no old username found in localStorage during rehydration check.");
                    }
                  }
                }
              };
            },
        }
    )
);    