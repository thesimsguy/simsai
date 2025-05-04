import { useState, useEffect, useCallback, useRef } from 'react';
import Pusher, { type Channel } from 'pusher-js';
import { useChatsStore } from '../../../stores/useChatsStore';
import { toast } from '@/hooks/useToast';
import { type ChatRoom, type ChatMessage } from "../../../../src/types/chat";

// Debounce helper
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
        const context = this;
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func.apply(context, args);
            timeoutId = null;
        }, wait);
    };
}

const PUSHER_APP_KEY = 'b47fd563805c8c42da1a';
const PUSHER_CLUSTER = 'us3';
const PUSHER_CHANNEL = 'chats';

export function useChatRoom(isWindowOpen: boolean, isForeground: boolean) {
    const {
        username,
        setUsername,
        rooms,
        setRooms,
        currentRoomId,
        setCurrentRoomId,
        roomMessages,
        setRoomMessagesForCurrentRoom,
        addMessageToRoom,
        removeMessageFromRoom,
        clearRoomMessages,
        isSidebarVisible,
        toggleSidebarVisibility,
    } = useChatsStore();

    // Derive isAdmin directly from the username
    const isAdmin = username === 'ryo';

    const pusherRef = useRef<Pusher | null>(null);
    const channelRef = useRef<Channel | null>(null); // Use imported Channel type
    const previousRoomIdRef = useRef<string | null>(currentRoomId); // Initialize with store value
    const debouncedSetRoomsRef = useRef(debounce(setRooms, 300)); // Debounce setRooms calls from Pusher
    const hasFetchedInitialData = useRef(false); // Flag to prevent duplicate initial fetches

    // --- API Interaction ---
    const callRoomAction = useCallback(async (action: 'joinRoom' | 'leaveRoom' | 'createRoom' | 'deleteRoom' | 'sendMessage' | 'getMessages' | 'getRooms' | 'createUser', payload: any) => {
        const queryParams = new URLSearchParams({ action });
        // Append payload keys as query params for GET requests
        const isGet = action === 'getRooms' || action === 'getMessages';
        if (isGet && payload) {
            Object.keys(payload).forEach(key => queryParams.append(key, payload[key]));
        }

        const url = `/api/chat-rooms?${queryParams.toString()}`;
        const method = isGet ? 'GET' : 'POST';
        const headers = method === 'POST' ? { 'Content-Type': 'application/json' } : undefined;
        const body = method === 'POST' ? JSON.stringify(payload) : undefined;

        console.log(`[API Call] Action: ${action}, Method: ${method}, URL: ${url}`, method === 'POST' ? payload : '');

        try {
            const response = await fetch(url, { method, headers, body });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                console.error(`[API Error] Action: ${action}, Status: ${response.status}`, errorData);
                return { ok: false, error: errorData.error || `Failed to ${action}` };
            }
            const data = await response.json();
            console.log(`[API Success] Action: ${action}`, data);
            return { ok: true, data };
        } catch (error) {
            console.error(`[API Network Error] Action: ${action}`, error);
            return { ok: false, error: 'Network error. Please try again.' };
        }
    }, []);

    // --- Room Management ---
    const fetchRooms = useCallback(async () => {
        console.log("[Room Hook] Fetching rooms...");
        const result = await callRoomAction('getRooms', {});
        if (result.ok && result.data?.rooms) {
            const fetchedRooms = result.data.rooms;
            console.log("[Room Hook] Fetched rooms data type:", typeof fetchedRooms, "Is Array:", Array.isArray(fetchedRooms));
            // Ensure fetchedRooms is an array before setting
            if (Array.isArray(fetchedRooms)) {
              setRooms(fetchedRooms); // Let store handle deep comparison
              // Restore last opened room if it exists in the fetched list
              const lastRoomId = localStorage.getItem('chats:lastOpenedRoomId'); // Still needed temporarily for initial load logic
              if (lastRoomId && fetchedRooms.some((r: ChatRoom) => r.id === lastRoomId)) {
                  if (currentRoomId !== lastRoomId) {
                      console.log(`[Room Hook] Restoring last opened room: ${lastRoomId}`);
                      setCurrentRoomId(lastRoomId);
                  }
              } else if (lastRoomId) {
                  console.log(`[Room Hook] Last opened room ${lastRoomId} not found in fetched list, clearing.`);
                  localStorage.removeItem('chats:lastOpenedRoomId');
                  if (currentRoomId === lastRoomId) setCurrentRoomId(null);
              }
            } else {
              console.warn("[Room Hook] Fetched rooms data is not an array:", fetchedRooms);
            }
        } else {
            console.error("[Room Hook] Failed to fetch rooms:", result.error);
            // Optionally load from cache here if API fails?
        }
    }, [callRoomAction, setRooms, setCurrentRoomId, currentRoomId]);

    const fetchMessagesForRoom = useCallback(async (roomId: string) => {
        if (!roomId) return;
        console.log(`[Room Hook] Fetching messages for room ${roomId}...`);
        const result = await callRoomAction('getMessages', { roomId }); // Pass roomId in payload for GET? API needs adjustment or use query param
        // Correcting: GET actions usually pass params in URL
        // const result = await fetch(`/api/chat-rooms?action=getMessages&roomId=${roomId}`);
        // Let's stick to the unified callRoomAction for now, assuming API handles it

        if (result.ok && result.data?.messages) {
            const fetchedMessages: ChatMessage[] = (result.data.messages || []).map((msg: any) => ({
                ...msg,
                timestamp: typeof msg.timestamp === "string" || typeof msg.timestamp === "number" ? new Date(msg.timestamp).getTime() : msg.timestamp,
            })).sort((a: ChatMessage, b: ChatMessage) => a.timestamp - b.timestamp);
            setRoomMessagesForCurrentRoom(fetchedMessages);
        } else {
            console.error(`[Room Hook] Failed to fetch messages for room ${roomId}:`, result.error);
        }
    }, [callRoomAction, setRoomMessagesForCurrentRoom]);

    // --- Username Management ---
    const handleUsernameSubmit = useCallback(async (submittedUsername: string) => {
        const trimmedUsername = submittedUsername.trim();
        if (!trimmedUsername) return { ok: false, error: "Username cannot be empty." };

        const result = await callRoomAction('createUser', { username: trimmedUsername });

        if (result.ok && result.data?.user) {
            setUsername(result.data.user.username);
            console.log(`[Username] Set to: ${result.data.user.username}`);
            // Joining current room is now handled by the main effect reacting to username change
            return { ok: true };
        }
        return { ok: false, error: result.error || 'Failed to set username.' };

    }, [callRoomAction, setUsername]);

    // --- Room Actions ---
    const handleRoomSelect = useCallback((newRoomId: string | null) => {
        const previousRoomId = previousRoomIdRef.current;
        console.log(`[Room Select] User selected room: ${newRoomId || '@ryo'} (from ${previousRoomId || '@ryo'})`);

        // Only fetch messages and update state if the room ID actually changes
        if (newRoomId !== previousRoomId) {
            setCurrentRoomId(newRoomId);
            // Fetch messages for the newly selected room *if* it's a real room ID
            if (newRoomId) {
                fetchMessagesForRoom(newRoomId);
            }
            // Note: Joining/leaving the room is handled by a separate effect reacting to currentRoomId change
            // The effect will handle the actual API calls based on this state change + username.
        } else {
             console.log(`[Room Select] Room ID ${newRoomId} is the same as the current one, skipping state update and fetch.`);
        }
    }, [setCurrentRoomId, fetchMessagesForRoom]); // Removed username, callRoomAction dependencies

    const sendRoomMessage = useCallback(async (content: string) => {
        if (!currentRoomId || !username || !content.trim()) return;

        const tempId = `temp_${Math.random().toString(36).substring(2, 9)}`;
        const newMessage: ChatMessage = { id: tempId, roomId: currentRoomId, username, content, timestamp: Date.now() };

        // Optimistically add message
        addMessageToRoom(currentRoomId, newMessage);

        const result = await callRoomAction('sendMessage', { roomId: currentRoomId, username, content });

        if (result.ok && result.data?.message) {
             // Replace temp message with actual message from server
            // The store logic should handle replacing the temp message
        } else {
            console.error('[Room Hook] Error sending room message:', result.error);
            // Remove optimistic message on failure
            removeMessageFromRoom(currentRoomId, tempId);
            toast("Error", { description: "Failed to send message." });
        }
    }, [currentRoomId, username, callRoomAction, addMessageToRoom, removeMessageFromRoom]);

    const handleAddRoom = useCallback(async (roomName: string) => {
        const trimmedRoomName = roomName.trim();
        if (!trimmedRoomName) return { ok: false, error: "Room name cannot be empty." };
        if (!username) return { ok: false, error: "Set a username first." };

        const result = await callRoomAction('createRoom', { name: trimmedRoomName });

        if (result.ok && result.data?.room) {
            const newRoom = result.data.room;
            // Don't manually setRooms here, let Pusher update handle it
            // setRooms([...rooms, newRoom]); // Add to local state immediately
            handleRoomSelect(newRoom.id); // Switch to the new room
            return { ok: true };
        } else {
            return { ok: false, error: result.error || 'Failed to create room.' };
        }
    }, [callRoomAction, username, handleRoomSelect]); // Removed rooms, setRooms dependency

    const handleDeleteRoom = useCallback(async (roomId: string) => {
        if (!roomId || !isAdmin) return { ok: false, error: "Permission denied or invalid room." };

        const result = await callRoomAction('deleteRoom', { roomId }); // API needs adjustment for DELETE method or query param
        // Assuming callRoomAction is adapted or API uses POST for delete
        // Alternative: const result = await fetch(`/api/chat-rooms?action=deleteRoom&roomId=${roomId}`, { method: 'DELETE' });

        if (result.ok) {
            // Don't manually setRooms here, let Pusher update handle it
            // setRooms(rooms.filter((room: ChatRoom) => room.id !== roomId));
            if (currentRoomId === roomId) {
                handleRoomSelect(null); // Switch back to @ryo
            }
            return { ok: true };
        } else {
            return { ok: false, error: result.error || 'Failed to delete room.' };
        }
    }, [callRoomAction, isAdmin, currentRoomId, handleRoomSelect]); // Removed rooms, setRooms dependency

    // --- Pusher Integration ---

    // Effect 1: Manage Pusher connection based on window visibility
    useEffect(() => {
        if (isWindowOpen && isForeground) {
            if (!pusherRef.current) {
                console.log('[Pusher Hook] Initializing Pusher...');
                pusherRef.current = new Pusher(PUSHER_APP_KEY, { cluster: PUSHER_CLUSTER });

                console.log(`[Pusher Hook] Subscribing to channel: ${PUSHER_CHANNEL}`);
                channelRef.current = pusherRef.current.subscribe(PUSHER_CHANNEL);

                // Bind events (consider moving binds to another effect if channel changes)
                channelRef.current.bind('rooms-updated', (data: { rooms: ChatRoom[] }) => {
                    console.log('[Pusher Hook] Received rooms-updated:', data);
                    debouncedSetRoomsRef.current(data.rooms);
                });

                channelRef.current.bind('room-message', (data: { roomId: string; message: ChatMessage }) => {
                    console.log('[Pusher Hook] Received room-message:', data);
                    const messageWithTimestamp = {
                        ...data.message,
                        timestamp: typeof data.message.timestamp === 'string' || typeof data.message.timestamp === 'number'
                            ? new Date(data.message.timestamp).getTime()
                            : data.message.timestamp
                    };
                    addMessageToRoom(data.roomId, messageWithTimestamp);

                    // Show toast if message is for another room
                    if (data.roomId !== currentRoomId && data.message.username !== username) {
                        // Get fresh room list for toast
                        const latestRooms = useChatsStore.getState().rooms;
                        const room = latestRooms.find((r: ChatRoom) => r.id === data.roomId);
                        if (room) {
                            toast(`${data.message.username} in #${room.name}`, {
                                description: data.message.content.length > 50 ? data.message.content.substring(0, 47) + '...' : data.message.content,
                                action: {
                                    label: "View",
                                    onClick: () => handleRoomSelect(room.id), // Select by ID
                                },
                                duration: 4000,
                            });
                        }
                    }
                });

                channelRef.current.bind('user-count-updated', (data: { roomId: string; userCount: number }) => {
                    console.log('[Pusher Hook] Received user-count-updated:', data);
                    const currentRooms = useChatsStore.getState().rooms; // Get current state
                    const updatedRooms = currentRooms.map((room: ChatRoom) =>
                        room.id === data.roomId ? { ...room, userCount: data.userCount } : room
                    );
                    debouncedSetRoomsRef.current(updatedRooms);
                });

                channelRef.current.bind('message-deleted', (data: { roomId: string; messageId: string }) => {
                    console.log(`[Pusher Hook] Received message-deleted for room ${data.roomId}, message ${data.messageId}`);
                    removeMessageFromRoom(data.roomId, data.messageId);
                });

                channelRef.current.bind('messages-cleared', (data: { roomId: string, timestamp: number }) => {
                    console.log(`[Pusher Hook] Received messages-cleared for room ${data.roomId}:`, data);
                    // Clear all room messages in the store regardless of current room
                     clearRoomMessages(data.roomId);
                });
            }
        } else {
            // Window closed or backgrounded, disconnect Pusher
            if (pusherRef.current) {
                console.log('[Pusher Hook] Disconnecting due to window close/background...');
                pusherRef.current.disconnect();
                pusherRef.current = null;
                channelRef.current = null;
                 hasFetchedInitialData.current = false; // Reset fetch flag on disconnect
            }
        }

        // Cleanup function for this effect
        return () => {
            // No explicit disconnect here, handled by the else block above
            // If component unmounts while window is open, the unmount effect below handles leaving room
            console.log("[Pusher Hook] Connection effect cleanup potentially running.");
        };
    }, [isWindowOpen, isForeground, addMessageToRoom, removeMessageFromRoom, clearRoomMessages, currentRoomId, username, handleRoomSelect]); // Dependencies that affect event handlers

    // Effect 2: Fetch initial data once Pusher is connected
    useEffect(() => {
        // Only run if Pusher is connected and initial data hasn't been fetched yet
        if (pusherRef.current && channelRef.current && !hasFetchedInitialData.current) {
            console.log("[Pusher Hook] Connected. Fetching initial room data...");
            hasFetchedInitialData.current = true; // Set flag immediately

            const fetchData = async () => {
                await fetchRooms(); // Fetch rooms first
                // After rooms are fetched, the store might update currentRoomId if restoring last opened
                const finalRoomId = useChatsStore.getState().currentRoomId; // Get potentially updated room ID

                // If a room was restored, fetch its messages
                if (finalRoomId) {
                    console.log("[Pusher Hook] Restored room:", finalRoomId, "Fetching messages.");
                    await fetchMessagesForRoom(finalRoomId); // Fetch messages for the initial room
                    previousRoomIdRef.current = finalRoomId; // Set the initial previous room ID
                    // Note: Joining the room is handled by Effect 4 based on username and currentRoomId
                }
            };

            fetchData();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchRooms, fetchMessagesForRoom]); // Dependencies: only fetch functions

    // Effect 3: Handle leaving room on component unmount or window close
    useEffect(() => {
        const handleBeforeUnload = () => {
            const roomToLeave = previousRoomIdRef.current;
            if (roomToLeave && username) {
                console.log("[Room Hook Unmount/Unload] Leaving room:", roomToLeave);
                 const payload = { roomId: roomToLeave, username };
                const data = JSON.stringify(payload);
                 // Use sendBeacon for reliability on page close
                navigator.sendBeacon('/api/chat-rooms?action=leaveRoom', data);
            }
        };

        // Add listener for page unload
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            // Remove listener on cleanup
            window.removeEventListener('beforeunload', handleBeforeUnload);

            // Also handle component unmount (e.g., closing the app window)
             handleBeforeUnload(); // Call it directly on unmount as well
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [username]); // Only depends on username for the cleanup action

    // Effect 4: Manage joining/leaving rooms based on username and currentRoomId changes
    useEffect(() => {
        const previousRoomId = previousRoomIdRef.current;
        const roomToLeave = previousRoomId;
        const roomToJoin = currentRoomId;

        console.log(`[Room Membership Effect] Running. User: ${username}, Current: ${roomToJoin}, Previous: ${roomToLeave}`);

        // Ensure Pusher is connected before attempting actions
        if (!pusherRef.current || !channelRef.current) {
            console.log("[Room Membership Effect] Pusher not ready, skipping.");
            return;
        }

        // Only proceed if username is set
        if (username) {
            // Leave previous room if it's different from the new one
            if (roomToLeave && roomToLeave !== roomToJoin) {
                console.log(`[Room Membership Effect] Leaving room: ${roomToLeave}`);
                callRoomAction('leaveRoom', { roomId: roomToLeave, username });
            }

            // Join new room if it exists and is different from the previous one
            if (roomToJoin && roomToJoin !== roomToLeave) {
                console.log(`[Room Membership Effect] Joining room: ${roomToJoin}`);
                callRoomAction('joinRoom', { roomId: roomToJoin, username });
            }
        } else {
            // If username becomes null (e.g., user logs out?), leave the current room
            if (roomToLeave) {
                console.log(`[Room Membership Effect] User logged out or username cleared, leaving room: ${roomToLeave}`);
                // We need the username *before* it became null to leave the room
                // This case might be complex or handled elsewhere (e.g., on explicit logout)
                // For now, we assume the username was available just before this effect ran.
                // If not, leaving might fail silently.
                // Consider passing the previous username if implementing logout.
            }
        }

        // Update the ref *after* performing actions based on the *previous* value
        if (previousRoomIdRef.current !== currentRoomId) {
             console.log(`[Room Membership Effect] Updating previousRoomIdRef to: ${currentRoomId}`);
             previousRoomIdRef.current = currentRoomId;
        }

    }, [username, currentRoomId, callRoomAction]); // Depend on username and current room ID

    // --- Dialog States & Handlers ---
    const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [isSettingUsername, setIsSettingUsername] = useState(false);
    const [usernameError, setUsernameError] = useState<string | null>(null);

    const [isNewRoomDialogOpen, setIsNewRoomDialogOpen] = useState(false);
    const [newRoomName, setNewRoomName] = useState("");
    const [isCreatingRoom, setIsCreatingRoom] = useState(false);
    const [roomError, setRoomError] = useState<string | null>(null);

    const [isDeleteRoomDialogOpen, setIsDeleteRoomDialogOpen] = useState(false);
    const [roomToDelete, setRoomToDelete] = useState<ChatRoom | null>(null);

    const promptSetUsername = useCallback(() => {
        console.log("[ChatRoom Hook Debug] promptSetUsername called. Current username:", username);
        setNewUsername(username || ""); // Ensure input field starts with current username or empty
        setUsernameError(null);
        setIsUsernameDialogOpen(true);
    }, [username]);

    const submitUsernameDialog = useCallback(async () => {
        setIsSettingUsername(true);
        const result = await handleUsernameSubmit(newUsername);
        setIsSettingUsername(false);
        if (result.ok) {
            setIsUsernameDialogOpen(false);
            setUsernameError(null);
        } else {
            setUsernameError(result.error);
        }
    }, [handleUsernameSubmit, newUsername, setIsUsernameDialogOpen]);

     const promptAddRoom = useCallback(() => {
        if (!username) {
            // If no username, prompt to set one first instead of opening the add room dialog
            promptSetUsername();
            toast("Set Username", { description: "Please set a username before creating a room." });
            return;
        }
        setNewRoomName("");
        setRoomError(null);
        setIsNewRoomDialogOpen(true);
    }, [username, promptSetUsername]);

     const submitNewRoomDialog = useCallback(async () => {
        setIsCreatingRoom(true);
        setRoomError(null);
        const result = await handleAddRoom(newRoomName);
        setIsCreatingRoom(false);
        if (result.ok) {
            setIsNewRoomDialogOpen(false);
        } else {
            setRoomError(result.error);
        }
    }, [handleAddRoom, newRoomName]);

     const promptDeleteRoom = useCallback((room: ChatRoom) => {
        setRoomToDelete(room);
        setIsDeleteRoomDialogOpen(true);
    }, []);

     const confirmDeleteRoom = useCallback(async () => {
        if (!roomToDelete) return;
        const result = await handleDeleteRoom(roomToDelete.id);
         setIsDeleteRoomDialogOpen(false);
         setRoomToDelete(null);
        if (!result.ok) {
            toast("Error", { description: result.error });
        }
    }, [handleDeleteRoom, roomToDelete]);


    return {
        // State
        username,
        rooms,
        currentRoomId,
        currentRoomMessages: roomMessages[currentRoomId || '@ryo'] || [], // Return messages for current room
        isSidebarVisible,
        isAdmin,

        // Actions
        handleRoomSelect,
        sendRoomMessage,
        toggleSidebarVisibility,

        // Dialog Triggers & Handlers
        promptSetUsername,
        promptAddRoom,
        promptDeleteRoom,

        // Username Dialog
        isUsernameDialogOpen,
        setIsUsernameDialogOpen,
        newUsername,
        setNewUsername,
        isSettingUsername,
        usernameError,
        submitUsernameDialog,

        // New Room Dialog
        isNewRoomDialogOpen,
        setIsNewRoomDialogOpen,
        newRoomName,
        setNewRoomName,
        isCreatingRoom,
        roomError,
        submitNewRoomDialog,

        // Delete Room Dialog
        isDeleteRoomDialogOpen,
        setIsDeleteRoomDialogOpen,
        roomToDelete,
        confirmDeleteRoom,
        
        // Explicitly add setter for username error
        setUsernameError
    };
} 