import { useState, useEffect, useCallback } from "react";
import { FileItem as DisplayFileItem } from "../components/FileList";
import { ensureIndexedDBInitialized } from "@/utils/storage";
import { getNonFinderApps, AppId } from "@/config/appRegistry";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useIpodStore } from "@/stores/useIpodStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useInternetExplorerStore, type Favorite } from "@/stores/useInternetExplorerStore";
import { useFilesStore, FileSystemItem } from "@/stores/useFilesStore";

// Store names for IndexedDB (Content)
const STORES = {
  DOCUMENTS: "documents",
  IMAGES: "images",
  TRASH: "trash",
  CUSTOM_WALLPAPERS: "custom_wallpapers",
} as const;

// Export STORE names
export { STORES };

// Interface for content stored in IndexedDB
export interface DocumentContent {
  name: string; // Used as the key in IndexedDB
  content: string | Blob;
  contentUrl?: string; // URL for Blob content (managed temporarily)
}

// Type for items displayed in the UI (might include contentUrl)
interface ExtendedDisplayFileItem extends Omit<DisplayFileItem, "content"> {
  content?: string | Blob; // Keep content for passing to apps
  contentUrl?: string;
  data?: any; // Add optional data field for virtual files
  originalPath?: string; // For trash items
  deletedAt?: number; // For trash items
  status?: 'active' | 'trashed'; // Include status for potential UI differences
}

// Generic CRUD operations
export const dbOperations = {
  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          db.close();
          resolve(request.result);
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error getting all items from ${storeName}:`, error);
        resolve([]);
      }
    });
  },

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    console.log(`[dbOperations] Getting key "${key}" from store "${storeName}"`);
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          console.log(`[dbOperations] Get success for key "${key}". Result:`, request.result);
          db.close();
          resolve(request.result);
        };
        request.onerror = () => {
          console.error(`[dbOperations] Get error for key "${key}":`, request.error);
          db.close();
          reject(request.error);
        };
      } catch (error) {
        console.error(`[dbOperations] Get exception for key "${key}":`, error);
        db.close();
        resolve(undefined);
      }
    });
  },

  async put<T>(storeName: string, item: T, key?: IDBValidKey): Promise<void> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(item, key);

        request.onsuccess = () => {
          db.close();
          resolve();
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error putting item in ${storeName}:`, error);
        reject(error);
      }
    });
  },

  async delete(storeName: string, key: string): Promise<void> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
          db.close();
          resolve();
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error deleting item from ${storeName}:`, error);
        reject(error);
      }
    });
  },

  async clear(storeName: string): Promise<void> {
    const db = await ensureIndexedDBInitialized();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          db.close();
          resolve();
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      } catch (error) {
        db.close();
        console.error(`Error clearing ${storeName}:`, error);
        reject(error);
      }
    });
  },
};

// --- Define Default Content Locally --- //
const README_CONTENT = `# ryOS 8.2

A web-based operating system experience inspired by classic Mac OS System 7. Built using modern web technologies including React, Vite, TailwindCSS, and shadcn/ui components.

## Features
- Classic System 7 UI with authentic typography
- Window management (drag, resize, maximize)
- File system with Documents, Applications, and Trash
- Multiple built-in applications
- Local storage persistence
- Modern audio features with WaveSurfer.js and Tone.js
- Responsive design for all screen sizes
- System-wide sound effects and themes
- Backup and restore functionality
- Virtual PC with classic games

## Built-in Applications
- **Finder**: Browse and manage your files
- **TextEdit**: Create and edit documents with markdown
- **MacPaint**: Classic bitmap graphics editor with image support
- **Soundboard**: Create and play custom soundboards
- **Synth**: Virtual synthesizer with retro aesthetics
- **Photo Booth**: Camera app with effects and filters
- **Control Panels**: Customize ryOS system settings
- **Minesweeper**: Classic puzzle game
- **Internet Explorer**: Browse historical web content
- **Chats**: Chat with Ryo AI assistant
- **Videos**: VCR-style video playlist player
- **Virtual PC**: Play classic DOS games

## Getting Started
- Double-click on any app icon to launch it
- Use the **Apple menu (🍎)** in the top-left to access system functions
- Files are automatically saved to your browser's storage
- Drag windows to move them, click and drag window edges to resize
- Use Control Panels to customize your experience
- Launch Virtual PC from Applications folder to play classic games

## Technical Details
- Built with React 18 and TypeScript
- Vite for fast development and bundling
- TailwindCSS for styling
- shadcn/ui components
- Bun as package manager
- WaveSurfer.js for audio visualization
- Tone.js for audio synthesis
- Virtual PC Emulator powered by DOSBox

Visit https://github.com/ryokun6/ryos for more information.`;

const QUICKTIPS_CONTENT = `# Quick Tips

## Using Apps
- Launch apps from the Finder, Desktop, or Apple menu
- Multiple apps can run simultaneously
- Windows can be moved, resized, and minimized
- Use Control Panels to customize your experience

## Finder
- Browse files in Documents, Applications, and Trash
- Navigate with back/forward buttons or path bar
- Sort files by name, kind, size, or date
- Multiple view options (icons, list)
- Move files to Trash and empty when needed
- Monitor available storage space

## TextEdit
- Create and edit rich text documents
- Format text with bold, italic, and underline
- Align text and create ordered/unordered lists
- Use slash commands (/) for quick formatting
- Support for markdown syntax
- Task list support with checkboxes
- Auto-saves your work
- Export documents when needed

## MacPaint
- Classic bitmap graphics editor
- Multiple drawing tools and patterns
- Shape tools with fill options
- Selection and move capabilities
- Image file import/export
- Undo/redo support

## Soundboard
- Create multiple custom soundboards
- Record sounds directly from your microphone
- Enhanced synth effects and processing
- Customize with emojis and titles
- Play sounds with clicks or number keys (1-9)
- View sound waveforms with WaveSurfer.js
- Import/export soundboards for sharing
- Auto-saves your recordings
- Choose input device
- Toggle waveform/emoji display

## Synth
- Play using on-screen keyboard or computer keys
- Choose between multiple waveforms:
  - Sine wave (smooth, pure tones)
  - Square wave (rich, buzzy sounds)
  - Sawtooth (bright, sharp tones)
  - Triangle (soft, hollow sounds)
- Add effects:
  - Reverb for space and depth
  - Delay for echo effects
  - Distortion for gritty tones
- Save and load custom presets
- MIDI keyboard support
- Classic synthesizer interface
- Real-time parameter control

## Photo Booth
- Take photos with your webcam
- Apply real-time effects:
  - Green Tint
  - High Contrast
  - Warm Vintage
  - Soft Sepia
  - Soft Focus
  - Black & White
  - Inverted
  - Green Boost
- Adjust brightness and contrast
- Multi-photo sequence mode
- Built-in photo gallery
- Export photos to Files
- Multiple camera support
- Flash effect on capture

## Control Panels
- Customize system appearance
  - Choose from tiled patterns or photos
  - Multiple categories of wallpapers
  - Real-time preview
- Adjust sound settings
  - Enable/disable UI sounds
  - Configure typing synthesis
  - Choose synth presets
- Manage system
  - Backup all settings
  - Restore from backup
  - Reset to defaults
  - Format file system

## Internet Explorer
- Browse historical web content
- Time travel with Wayback Machine
- Classic System 7 style interface
- Add websites to favorites
- View content from different years

## Chats with Ryo
- Natural conversation with Ryo AI
- Control system through chat
- Launch and manage apps
- Edit documents directly
- Get help with features
- Ask about design and concepts

## Videos
- VCR-style video playlist player
- Add and manage YouTube videos
- Shuffle and repeat modes
- LCD display with scrolling titles
- Classic CD player controls
- Playlist management
- Local storage for favorites

## Virtual PC
- Play classic DOS games
- Doom, SimCity, and more
- Save game states
- Full DOS environment
- Keyboard and mouse support`;
// --- End Default Content --- //

// --- Helper Functions --- //

// Get specific type from extension
function getFileTypeFromExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || "unknown";
  switch (ext) {
    case "md": return "markdown";
    case "txt": return "text";
    case "png": return ext;
    case "jpg": case "jpeg": return "jpg"; // Standardize to jpg for jpeg/jpg files
    case "gif": return ext;
    case "webp": return ext;
    case "bmp": return ext;
    default: return "unknown";
  }
}

// Get icon based on FileSystemItem metadata
function getFileIcon(item: FileSystemItem): string {
  if (item.icon) return item.icon; // Use specific icon if provided
  if (item.isDirectory) {
      // Special handling for Trash icon based on content
      if (item.path === '/Trash') {
          // We need a way to know if trash is empty. We'll use local state for now.
          // This will be updated when trashItems state changes.
          return '/icons/trash-empty.png'; // Placeholder, will be updated by effect
      }
      return "/icons/directory.png";
  }

  switch (item.type) {
    case "png": case "jpg": case "jpeg": case "gif": case "webp": case "bmp":
      return "/icons/image.png";
    case "markdown": case "text":
      return "/icons/file-text.png";
    case "application": // Should ideally use item.icon from registry
      return item.icon || "/icons/file.png"; // Use item.icon if available
    case "Music": return "/icons/sound.png";
    case "Video": return "/icons/video-tape.png";
    case "site-link": return "/icons/site.png";
    default:
      return "/icons/file.png";
  }
}

// --- Global flag for initialization --- //
let isInitialContentCheckDone = false;

// --- useFileSystem Hook --- //
export function useFileSystem(initialPath: string = "/") {
  console.log(`[useFileSystem] Hook initialized/re-run for path: ${initialPath}`);
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [files, setFiles] = useState<ExtendedDisplayFileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<ExtendedDisplayFileItem>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [history, setHistory] = useState<string[]>([initialPath]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Zustand Stores
  const fileStore = useFilesStore();
  const launchApp = useLaunchApp();
  const { tracks: ipodTracks, setCurrentIndex: setIpodIndex, setIsPlaying: setIpodPlaying } = useIpodStore();
  const { videos: videoTracks, setCurrentIndex: setVideoIndex, setIsPlaying: setVideoPlaying } = useVideoStore();
  const internetExplorerStore = useInternetExplorerStore();

  // Define getParentPath inside hook
  const getParentPath = (path: string): string => {
      if (path === '/') return '/';
      const parts = path.split('/').filter(Boolean);
      if (parts.length <= 1) return '/';
      return '/' + parts.slice(0, -1).join('/');
  };

  // --- Initialization Effect for Content (Runs ONLY ONCE globally) --- //
  useEffect(() => {
    // Check the global flag
    if (isInitialContentCheckDone) {
      console.log("[useFileSystem] Initial content check already performed, skipping.");
      return;
    }

    const initializeContent = async () => {
      console.log("[useFileSystem] Performing initial content check in IndexedDB...");
      const initialMetadata = useFilesStore.getState().items;
      const defaultContentMap: Record<string, string> = {
        "/Documents/README.md": README_CONTENT,
        "/Documents/Quick Tips.md": QUICKTIPS_CONTENT,
      };

      for (const path in defaultContentMap) {
        if (initialMetadata[path]) { // Check if metadata exists
          const itemName = initialMetadata[path].name;
          const storeName = STORES.DOCUMENTS; // Assuming defaults are documents
          try {
            const existingContent = await dbOperations.get<DocumentContent>(storeName, itemName);
            if (!existingContent) {
              console.log(`[useFileSystem] Adding missing default content for ${itemName} to ${storeName}`);
              await dbOperations.put<DocumentContent>(storeName, {
                name: itemName,
                content: defaultContentMap[path]
              });
            }
          } catch (err) {
            console.error(`[useFileSystem] Error checking/adding content for ${itemName}:`, err);
          }
        }
      }
      console.log("[useFileSystem] Initial content check complete.");
      // Set the global flag to true after the first successful run
      isInitialContentCheckDone = true;
    };
    initializeContent();
  }, []); // Empty dependency array still ensures it tries to run once per mount
  // --- End Initialization Effect --- //

  // --- REORDERED useCallback DEFINITIONS --- //

  // Define navigateToPath first
  const navigateToPath = useCallback((path: string) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    setSelectedFile(undefined);
    if (normalizedPath !== currentPath) {
      setHistory((prev) => {
          const newHistory = prev.slice(0, historyIndex + 1);
          newHistory.push(normalizedPath);
          return newHistory;
          });
      setHistoryIndex((prev) => prev + 1);
      setCurrentPath(normalizedPath);
      }
  }, [currentPath, historyIndex]);

  // Define loadFiles next
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      let displayFiles: ExtendedDisplayFileItem[] = [];

      // 1. Handle Virtual Directories
      if (currentPath === "/Applications") {
        displayFiles = getNonFinderApps().map((app) => ({
          name: app.name,
          isDirectory: false,
          path: `/Applications/${app.name}`,
          icon: app.icon,
          appId: app.id,
          type: "application",
        }));
      } else if (currentPath === "/Music") {
         // At root music directory, show artist folders
         const artistSet = new Set<string>();
         
         // Collect all unique artists
         ipodTracks.forEach(track => {
           if (track.artist) {
             artistSet.add(track.artist);
           }
         });
         
         // Create a folder for artists with tracks
         displayFiles = Array.from(artistSet).map(artist => ({
           name: artist,
           isDirectory: true,
           path: `/Music/${encodeURIComponent(artist)}`,
           icon: "/icons/directory.png",
           type: "directory-virtual",
         }));
         
         // Add an "Unknown Artist" folder if there are tracks without artists
         if (ipodTracks.some(track => !track.artist)) {
           displayFiles.push({
             name: "Unknown Artist",
             isDirectory: true,
             path: `/Music/Unknown Artist`,
             icon: "/icons/directory.png",
             type: "directory-virtual",
           });
         }
      } else if (currentPath.startsWith("/Music/")) {
         // Inside an artist folder
         const artistName = decodeURIComponent(currentPath.replace("/Music/", ""));
         const artistTracks = ipodTracks.filter(track => 
           artistName === "Unknown Artist" 
             ? !track.artist 
             : track.artist === artistName
         );
         
         // Display all tracks for this artist
         displayFiles = artistTracks.map((track) => {
           const globalIndex = ipodTracks.findIndex(t => t.id === track.id);
           return {
             name: `${track.title}.mp3`,
             isDirectory: false,
             path: `/Music/${track.id}`,
             icon: "/icons/sound.png",
             appId: "ipod",
             type: "Music",
             data: { index: globalIndex },
           };
         });
      } else if (currentPath === "/Videos") {
         // At root videos directory, show artist folders
         const artistSet = new Set<string>();
         
         // Collect all unique artists
         videoTracks.forEach(video => {
           if (video.artist) {
             artistSet.add(video.artist);
           }
         });
         
         // Create a folder for artists with videos
         displayFiles = Array.from(artistSet).map(artist => ({
           name: artist,
           isDirectory: true,
           path: `/Videos/${encodeURIComponent(artist)}`,
           icon: "/icons/directory.png",
           type: "directory-virtual",
         }));
         
         // Add an "Unknown Artist" folder if there are videos without artists
         if (videoTracks.some(video => !video.artist)) {
           displayFiles.push({
             name: "Unknown Artist",
             isDirectory: true,
             path: `/Videos/Unknown Artist`,
             icon: "/icons/directory.png",
             type: "directory-virtual",
           });
         }
      } else if (currentPath.startsWith("/Videos/")) {
         // Inside a video artist folder
         const artistName = decodeURIComponent(currentPath.replace("/Videos/", ""));
         const artistVideos = videoTracks.filter(video => 
           artistName === "Unknown Artist" 
             ? !video.artist 
             : video.artist === artistName
         );
         
         // Display all videos for this artist
         displayFiles = artistVideos.map(video => {
           const globalIndex = videoTracks.findIndex(v => v.id === video.id);
           return {
             name: `${video.title}.mov`,
             isDirectory: false,
             path: `/Videos/${video.id}`,
             icon: "/icons/video-tape.png",
             appId: "videos",
             type: "Video",
             data: { index: globalIndex },
           };
         });
      } else if (currentPath.startsWith("/Sites")) {
        console.log(`[useFileSystem:loadFiles] Loading /Sites path: ${currentPath}`); // Log entry
        const pathParts = currentPath.split("/").filter(Boolean);
        console.log(`[useFileSystem:loadFiles] Path parts:`, pathParts); // Log parts
        let currentLevelFavorites = internetExplorerStore.favorites;
        let currentVirtualPath = "/Sites";

        // Traverse down the favorites structure based on the path
        for (let i = 1; i < pathParts.length; i++) {
          const folderName = decodeURIComponent(pathParts[i]);
          console.log(`[useFileSystem:loadFiles] Traversing into folder: ${folderName}`); // Log traversal
          const parentFolder = currentLevelFavorites.find(
            (fav) => fav.isDirectory && fav.title === folderName
          );
          if (parentFolder && parentFolder.children) {
            currentLevelFavorites = parentFolder.children;
            currentVirtualPath += `/${folderName}`;
            console.log(`[useFileSystem:loadFiles] Found sub-folder, new level count: ${currentLevelFavorites.length}`); // Log sub-level
          } else {
            console.log(`[useFileSystem:loadFiles] Sub-folder "${folderName}" not found or has no children.`); // Log not found
            currentLevelFavorites = [];
            break;
          }
        }
        console.log(`[useFileSystem:loadFiles] Final level favorites to map (count: ${currentLevelFavorites.length}):`, currentLevelFavorites); // Log before map

        // Map the current level favorites to FileItems
        displayFiles = currentLevelFavorites.map((fav: Favorite) => {
            const isDirectory = fav.isDirectory ?? false;
            const name = fav.title || (isDirectory ? "Folder" : "Link");
            const path = `${currentVirtualPath}/${encodeURIComponent(name)}`;
            return {
                name: name,
                isDirectory: isDirectory,
                path: path,
                icon: isDirectory ? "/icons/directory.png" : fav.favicon || "/icons/site.png",
                appId: isDirectory ? undefined : "internet-explorer",
                type: isDirectory ? "directory-virtual" : "site-link",
                data: isDirectory ? undefined : { url: fav.url, year: fav.year || "current" },
            };
        });
        console.log(`[useFileSystem:loadFiles] Mapped displayFiles for /Sites (count: ${displayFiles.length}):`, displayFiles); // Log final result
      }
      // 2. Handle Trash Directory (Uses fileStore)
      else if (currentPath === "/Trash") {
        // Get metadata from the store
        const itemsMetadata = fileStore.getItemsInPath(currentPath);
        displayFiles = itemsMetadata.map((item) => ({
          ...item,
          icon: getFileIcon(item), // Get icon based on metadata
        }));
      }
      // 3. Handle Real Directories (Uses useFilesStore)
      else {
        const itemsMetadata = fileStore.getItemsInPath(currentPath);
        // Map metadata to display items. Content fetching happens on open.
        displayFiles = itemsMetadata.map(item => ({
          ...item,
            icon: getFileIcon(item),
            appId: item.appId,
        }));

        // --- START EDIT: Fetch content URLs for /Images path and its subdirectories ---
        if (currentPath === "/Images" || currentPath.startsWith("/Images/")) {
            displayFiles = await Promise.all(itemsMetadata.map(async (item) => {
                let contentUrl: string | undefined;
                if (!item.isDirectory) {
                    try {
                        console.log(`[useFileSystem:loadFiles] Fetching content for ${item.name}, type: ${item.type}`);
                        const contentData = await dbOperations.get<DocumentContent>(STORES.IMAGES, item.name);
                        
                        if (contentData?.content instanceof Blob) {
                            console.log(`[useFileSystem:loadFiles] Found Blob content for ${item.name}, creating URL`);
                            contentUrl = URL.createObjectURL(contentData.content);
                            console.log(`[useFileSystem:loadFiles] Created URL: ${contentUrl}`);
                        } else {
                            console.log(`[useFileSystem:loadFiles] No Blob content found for ${item.name}`);
                        }
                    } catch (err) {
                        console.error(`Error fetching image content for ${item.name}:`, err);
                    }
                }
                
                // Ensure the item type is properly set for image files
                const fileExt = item.name.split('.').pop()?.toLowerCase();
                const isImageFile = ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(fileExt || "");
                const type = isImageFile ? fileExt || item.type : item.type;
                
                return {
                    ...item,
                    icon: getFileIcon(item),
                    appId: item.appId,
                    contentUrl: contentUrl,
                    type: type, // Ensure type is correctly set
                };
            }));
        }
        // --- END EDIT ---
      }

      setFiles(displayFiles);
    } catch (err) {
      console.error("[useFileSystem] Error loading files:", err);
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setIsLoading(false);
    }
    // Add fileStore dependency to re-run if items change
  }, [currentPath, fileStore.items, ipodTracks, videoTracks, internetExplorerStore.favorites]);

  // Define handleFileOpen
  const handleFileOpen = useCallback(async (file: ExtendedDisplayFileItem) => {
    // 1. Handle Directories (Virtual and Real)
    if (file.isDirectory) {
      if (file.type === "directory" || file.type === "directory-virtual") {
        navigateToPath(file.path);
      }
      return;
    }

    // 2. Handle Files (Fetch content if needed)
    let contentToUse: string | Blob | undefined = undefined;
    let contentUrlToUse: string | undefined = undefined;
    let contentAsString: string | undefined = undefined;

    try {
        // Fetch content from IndexedDB (Documents or Images)
        if (file.path.startsWith("/Documents/") || file.path.startsWith("/Images/")) {
            const storeName = file.path.startsWith("/Documents/") ? STORES.DOCUMENTS : STORES.IMAGES;
            const contentData = await dbOperations.get<DocumentContent>(storeName, file.name);
            if (contentData) {
                contentToUse = contentData.content;
            } else {
                console.warn(`[useFileSystem] Content not found in IndexedDB for ${file.path}`);
            }
        }

        // Process content: Read blob to string for TextEdit, create URL for Paint
        if (contentToUse instanceof Blob) {
            if (file.path.startsWith("/Documents/")) {
                contentAsString = await contentToUse.text();
                console.log(`[useFileSystem] Read Blob as text for ${file.name}, length: ${contentAsString?.length}`);
            } else if (file.path.startsWith("/Images/")) {
                // Don't create URL here, pass the Blob itself
                // contentUrlToUse = URL.createObjectURL(contentToUse);
                // console.log(`[useFileSystem] Created Blob URL for ${file.name}: ${contentUrlToUse}`);
            }
        } else if (typeof contentToUse === 'string') {
            contentAsString = contentToUse;
            console.log(`[useFileSystem] Using string content directly for ${file.name}, length: ${contentAsString?.length}`);
        }

        // 3. Launch Appropriate App
        console.log(`[useFileSystem] Preparing initialData for ${file.path}:`, { contentAsString, contentUrlToUse });
        if (file.path.startsWith("/Applications/") && file.appId) {
            launchApp(file.appId as AppId);
        } else if (file.path.startsWith("/Documents/")) {
            launchApp("textedit", { initialData: { path: file.path, content: contentAsString ?? '' } });
        } else if (file.path.startsWith("/Images/")) {
            // Pass the Blob object itself to Paint via initialData
            launchApp("paint", { initialData: { path: file.path, content: contentToUse } }); // Pass contentToUse (Blob)
        } else if (file.appId === "ipod" && file.data?.index !== undefined) {
            // iPod uses data directly from the index we calculated
            const trackIndex = file.data.index;
            setIpodIndex(trackIndex);
            setIpodPlaying(true);
            launchApp("ipod");
        } else if (file.appId === "videos" && file.data?.index !== undefined) {
            // Videos uses data directly, no change needed here for initialData
            setVideoIndex(file.data.index);
            setVideoPlaying(true);
            launchApp("videos");
        } else if (file.type === "site-link" && file.data?.url) {
            // Pass url and year via initialData instead of using IE store directly
            launchApp("internet-explorer", { initialData: { url: file.data.url, year: file.data.year || "current" } });
            // internetExplorerStore.setPendingNavigation(file.data.url, file.data.year || "current");
        } else {
             console.warn(`[useFileSystem] No handler defined for opening file type: ${file.type} at path: ${file.path}`);
        }
    } catch (err) {
        console.error(`[useFileSystem] Error opening file ${file.path}:`, err);
        setError(`Failed to open ${file.name}`);
    }
  }, [launchApp, navigateToPath, setIpodIndex, setIpodPlaying, setVideoIndex, setVideoPlaying, internetExplorerStore]);

  // Load files whenever dependencies change
  useEffect(() => {
    loadFiles();
  }, [loadFiles]); // Depend only on the memoized loadFiles

  // --- handleFileSelect, Navigation Functions --- //
  const handleFileSelect = useCallback((file: ExtendedDisplayFileItem | undefined) => { setSelectedFile(file); }, []);
  const navigateUp = useCallback(() => {
    if (currentPath === "/") return;
    const parentPath = getParentPath(currentPath);
    navigateToPath(parentPath); // navigateToPath is defined above
  }, [currentPath, navigateToPath, getParentPath]);
  const navigateBack = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentPath(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);
  const navigateForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentPath(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);
  const canNavigateBack = useCallback(() => historyIndex > 0, [historyIndex]);
  const canNavigateForward = useCallback(() => historyIndex < history.length - 1, [historyIndex, history]);

  // --- File Operations (Refactored) --- //

  const saveFile = useCallback(async (fileData: { path: string; name: string; content: string | Blob; type?: string; icon?: string }) => {
    const { path, name, content } = fileData;
    console.log(`[useFileSystem:saveFile] Attempting to save: ${path}`);
    setError(undefined);

    const isDirectory = false;
    const fileType = fileData.type || getFileTypeFromExtension(name);

    // 1. Create the full metadata object first
    const metadata: FileSystemItem = {
        path: path,
        name: name,
        isDirectory: isDirectory,
        type: fileType,
        status: 'active', // Explicitly set status
        // Now call getFileIcon with the complete metadata object
        icon: fileData.icon || getFileIcon({ path, name, isDirectory, type: fileType, status: 'active' } as FileSystemItem),
    };

    // 2. Add/Update Metadata in FileStore
    try {
        console.log(`[useFileSystem:saveFile] Updating metadata store for: ${path}`);
        // Pass the complete metadata object to addItem (it expects Omit<FileSystemItem, 'status'> but will ignore extra fields)
        fileStore.addItem(metadata);
        console.log(`[useFileSystem:saveFile] Metadata store updated for: ${path}`);
    } catch (metaError) {
        console.error(`[useFileSystem:saveFile] Error updating metadata store for ${path}:`, metaError);
        setError(`Failed to save file metadata for ${name}`);
        return;
    }

    // 3. Save Content to IndexedDB
    const storeName = path.startsWith("/Documents/") ? STORES.DOCUMENTS : path.startsWith("/Images/") ? STORES.IMAGES : null;
    if (storeName) {
        try {
            const contentToStore: DocumentContent = { name: name, content: content };
            console.log(`[useFileSystem:saveFile] Saving content to IndexedDB (${storeName}) for: ${name}`);
            await dbOperations.put<DocumentContent>(storeName, contentToStore);
            console.log(`[useFileSystem:saveFile] Content saved to IndexedDB for: ${name}`);
        } catch (err) {
            console.error(`[useFileSystem:saveFile] Error saving content to IndexedDB for ${path}:`, err);
            setError(`Failed to save file content for ${name}`);
        }
    } else {
        console.warn(`[useFileSystem:saveFile] No valid content store for path: ${path}`);
    }
  }, [fileStore]);

  const moveFile = useCallback(async (sourceFile: FileSystemItem, targetFolderPath: string) => {
    if (!sourceFile || sourceFile.isDirectory) {
      console.error("[useFileSystem:moveFile] Invalid source file or attempting to move a directory");
      setError("Cannot move this item");
      return false;
    }

    const targetFolder = fileStore.getItem(targetFolderPath);
    if (!targetFolder || !targetFolder.isDirectory) {
      console.error(`[useFileSystem:moveFile] Target is not a valid directory: ${targetFolderPath}`);
      setError("Invalid target folder");
      return false;
    }

    // Determine new path
    const newPath = `${targetFolderPath}/${sourceFile.name}`;
    
    // Check if destination already exists
    if (fileStore.getItem(newPath)) {
      console.error(`[useFileSystem:moveFile] A file with the same name already exists at destination: ${newPath}`);
      setError("A file with the same name already exists in the destination folder");
      return false;
    }

    try {
      // Determine source and target stores for content
      const sourcePath = sourceFile.path;
      const sourceStoreName = sourcePath.startsWith("/Documents/") ? STORES.DOCUMENTS : 
                            sourcePath.startsWith("/Images/") ? STORES.IMAGES : null;
      const targetStoreName = targetFolderPath.startsWith("/Documents") ? STORES.DOCUMENTS : 
                            targetFolderPath.startsWith("/Images") ? STORES.IMAGES : null;

      // If content needs to move between different stores
      if (sourceStoreName && targetStoreName && sourceStoreName !== targetStoreName) {
        // Get content from source store
        const content = await dbOperations.get<DocumentContent>(sourceStoreName, sourceFile.name);
        if (content) {
          // Save to target store
          await dbOperations.put<DocumentContent>(targetStoreName, content);
          // Delete from source store
          await dbOperations.delete(sourceStoreName, sourceFile.name);
        }
      }
      
      // Update metadata in file store
      fileStore.moveItem(sourcePath, newPath);
      console.log(`[useFileSystem:moveFile] Successfully moved ${sourcePath} to ${newPath}`);
      return true;
    } catch (err) {
      console.error(`[useFileSystem:moveFile] Error moving file: ${err}`);
      setError("Failed to move file");
      return false;
    }
  }, [fileStore]);

  const renameFile = useCallback(async (oldPath: string, newName: string) => {
      const itemToRename = fileStore.getItem(oldPath);
      if (!itemToRename) {
          console.error("Error: Item to rename not found in FileStore");
          setError("Failed to rename file");
          return;
      }

      const parentPath = getParentPath(oldPath);
      const newPath = `${parentPath === '/' ? '' : parentPath}/${newName}`;
      const oldName = itemToRename.name;

      if (fileStore.getItem(newPath)) {
          console.error("Error: New path already exists in FileStore");
          setError("Failed to rename file");
          return;
      }

      // 1. Rename Metadata in FileStore
      fileStore.renameItem(oldPath, newPath, newName);

      // 2. Rename Content Key in IndexedDB (Only if it's a file with content)
      if (!itemToRename.isDirectory) {
          const storeName = oldPath.startsWith("/Documents/") ? STORES.DOCUMENTS : oldPath.startsWith("/Images/") ? STORES.IMAGES : null;
          if (storeName) {
              try {
                  const content = await dbOperations.get<DocumentContent>(storeName, oldName);
                  if (content) {
                      await dbOperations.delete(storeName, oldName);
                      await dbOperations.put<DocumentContent>(storeName, { ...content, name: newName });
                  } else {
                      console.warn("Warning: Content not found in IndexedDB for renaming");
                  }
              } catch (err) {
                  console.error("Error renaming file:", err);
                  setError("Failed to rename file");
              }
          }
      }
  }, [fileStore, getParentPath]);

  // --- Create Folder --- //
  const createFolder = useCallback((folderData: { path: string; name: string }) => {
      const { path, name } = folderData;
      if (fileStore.getItem(path)) {
          console.error("Folder already exists:", path);
          setError("Folder already exists.");
          return;
    }
      const newFolderItem: Omit<FileSystemItem, 'status'> = {
          path: path,
          name: name,
          isDirectory: true,
          type: 'directory',
          icon: '/icons/directory.png',
      };
      fileStore.addItem(newFolderItem);
      setError(undefined); // Clear previous error
  }, [fileStore]);

  const moveToTrash = useCallback(async (fileMetadata: FileSystemItem) => {
    if (!fileMetadata || fileMetadata.path === "/" || fileMetadata.path === "/Trash" || fileMetadata.status === 'trashed') return;

    // 1. Mark item as trashed in FileStore
    fileStore.removeItem(fileMetadata.path);

    // 2. Move Content to TRASH DB store
    const storeName = fileMetadata.path.startsWith("/Documents/") ? STORES.DOCUMENTS : fileMetadata.path.startsWith("/Images/") ? STORES.IMAGES : null;
    if (storeName && !fileMetadata.isDirectory) {
        try {
            const content = await dbOperations.get<DocumentContent>(storeName, fileMetadata.name);
            if (content) {
                // Store content in TRASH store using name as key
                await dbOperations.put<DocumentContent>(STORES.TRASH, content);
                await dbOperations.delete(storeName, fileMetadata.name);
                console.log(`[useFileSystem] Moved content for ${fileMetadata.name} from ${storeName} to Trash DB.`);
            } else { console.warn(`[useFileSystem] Content not found for ${fileMetadata.name} in ${storeName} during move to trash.`); }
        } catch (err) {
            console.error("Error moving content to trash:", err);
            setError("Failed to move content to trash");
        }
    }
  }, [fileStore]);

  const restoreFromTrash = useCallback(async (itemToRestore: ExtendedDisplayFileItem) => {
      const fileMetadata = fileStore.getItem(itemToRestore.path);
      if (!fileMetadata || fileMetadata.status !== 'trashed' || !fileMetadata.originalPath) {
          console.error("Cannot restore: Item not found in store or not in trash.");
          setError("Cannot restore item.");
          return;
      }

      // 1. Restore metadata in FileStore
      fileStore.restoreItem(fileMetadata.path);

      // 2. Move Content from TRASH DB store back
      const targetStoreName = fileMetadata.originalPath.startsWith("/Documents/") ? STORES.DOCUMENTS : fileMetadata.originalPath.startsWith("/Images/") ? STORES.IMAGES : null;
      if (targetStoreName && !fileMetadata.isDirectory) {
          try {
              const content = await dbOperations.get<DocumentContent>(STORES.TRASH, fileMetadata.name);
              if (content) {
                  await dbOperations.put<DocumentContent>(targetStoreName, content);
                  await dbOperations.delete(STORES.TRASH, fileMetadata.name); // Delete content from trash store
                  console.log(`[useFileSystem] Restored content for ${fileMetadata.name} from Trash DB to ${targetStoreName}.`);
              } else { console.warn(`[useFileSystem] Content not found for ${fileMetadata.name} in Trash DB during restore.`); }
          } catch (err) {
              console.error("Error restoring content from trash:", err);
              setError("Failed to restore content from trash");
          }
      }
  }, [fileStore]);

  const emptyTrash = useCallback(async () => {
    // 1. Permanently delete metadata from FileStore and get names of files whose content needs deletion
    const contentNamesToDelete = fileStore.emptyTrash();

    // 2. Clear corresponding content from TRASH IndexedDB store
    try {
        // Clear all potential metadata records first (paths were keys before)
        // This might be redundant if emptyTrash handles it, but safer
        // await dbOperations.clear(STORES.TRASH);

        // Now delete content based on names collected from fileStore.emptyTrash()
        for (const name of contentNamesToDelete) {
            await dbOperations.delete(STORES.TRASH, name);
        }
        console.log("[useFileSystem] Cleared trash content from IndexedDB.");
    } catch (err) {
        console.error("Error clearing trash content from IndexedDB:", err);
        setError("Failed to empty trash storage.");
    }
  }, [fileStore]);

  // --- Format File System (Refactored) --- //
  const formatFileSystem = useCallback(async () => {
    try {
      await Promise.all([
        dbOperations.clear(STORES.IMAGES),
        dbOperations.clear(STORES.TRASH),
        dbOperations.clear(STORES.CUSTOM_WALLPAPERS),
      ]);
      await dbOperations.clear(STORES.DOCUMENTS);

      // Re-add default document content to DB using the constants
      const initialDocsContent = [
          { name: "README.md", content: README_CONTENT },
          { name: "Quick Tips.md", content: QUICKTIPS_CONTENT }
      ];
      for (const doc of initialDocsContent) {
          await dbOperations.put<DocumentContent>(STORES.DOCUMENTS, { name: doc.name, content: doc.content });
      }

      fileStore.reset(); // Reset metadata store
      // No need to setTrashItems([]) as it's removed
      setCurrentPath("/");
      setHistory(["/"]);
      setHistoryIndex(0);
      setSelectedFile(undefined);
      setError(undefined);
    } catch (err) {
      console.error("Error formatting file system:", err);
      setError("Failed to format file system");
    }
  }, [fileStore]);

  // Calculate trash count based on store data
  const trashItemsCount = fileStore.getItemsInPath('/Trash').length;

  return {
    currentPath,
    files,
    selectedFile,
    isLoading,
    error,
    handleFileOpen,
    handleFileSelect,
    navigateUp,
    navigateToPath,
    moveToTrash: (file: ExtendedDisplayFileItem) => {
        const itemMeta = fileStore.getItem(file.path);
        if (itemMeta) {
            moveToTrash(itemMeta);
        } else { /* ... error ... */ }
    },
    restoreFromTrash,
    emptyTrash,
    trashItemsCount, // Provide count derived from store
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    saveFile,
    setSelectedFile: handleFileSelect,
    renameFile,
    createFolder,
    formatFileSystem,
    moveFile,
  };
}
