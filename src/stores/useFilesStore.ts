import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// --- Define Initial Documents Data Locally --- //
const INITIAL_DOCUMENTS_DATA: { name: string; content?: string }[] = [
  {
    name: "README.md",
    // Content is not stored in this store, but we keep the structure
  },
  {
    name: "Quick Tips.md",
  },
];
// --- End Initial Documents Data --- //

// Define the structure for a file system item (metadata)
export interface FileSystemItem {
  path: string; // Full path, unique identifier (e.g., "/Documents/My Folder/My File.txt")
  name: string; // Just the file/folder name (e.g., "My File.txt")
  isDirectory: boolean;
  icon?: string; // Optional: Specific icon override
  type?: string; // File type (e.g., 'text', 'png', 'folder') - derived if not folder
  appId?: string; // For launching applications or associated apps
  // Trash properties
  status: 'active' | 'trashed';
  originalPath?: string; // Path before being moved to trash
  deletedAt?: number; // Timestamp when moved to trash
  // Content is NOT stored here, only metadata
}

// Define the state structure
interface FilesStoreState {
  items: Record<string, FileSystemItem>; // path -> item map
  // Actions
  addItem: (item: Omit<FileSystemItem, 'status'>) => void; // Status defaults to active
  removeItem: (path: string, permanent?: boolean) => void; // Add flag for permanent deletion
  restoreItem: (path: string) => void;
  emptyTrash: () => string[]; // Returns paths of items whose content should be deleted
  renameItem: (oldPath: string, newPath: string, newName: string) => void;
  moveItem: (sourcePath: string, destinationPath: string) => boolean; // Add moveItem method
  getItemsInPath: (path: string) => FileSystemItem[];
  getItem: (path: string) => FileSystemItem | undefined;
  getTrashItems: () => FileSystemItem[]; // Helper to get all trashed items
  reset: () => void;
}

// Helper function to get file type from name (simplified)
function getFileTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'md': return 'markdown';
    case 'txt': return 'text';
    case 'png': return 'png';
    case 'jpg': case 'jpeg': return 'jpeg';
    case 'gif': return 'gif';
    case 'webp': return 'webp';
    case 'bmp': return 'bmp';
    default: return 'unknown';
  }
}

// Helper function to get parent path
const getParentPath = (path: string): string => {
    if (path === '/') return '/';
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 1) return '/'; // Parent of /Documents is /
    return '/' + parts.slice(0, -1).join('/');
};


// Function to generate the initial state
const getInitialFileSystemState = (): Record<string, FileSystemItem> => {
  const initialState: Record<string, FileSystemItem> = {
    '/': { path: '/', name: '/', isDirectory: true, type: 'directory', status: 'active' },
    '/Applications': { path: '/Applications', name: 'Applications', isDirectory: true, type: 'directory-virtual', icon: '/icons/applications.png', status: 'active' },
    '/Documents': { path: '/Documents', name: 'Documents', isDirectory: true, type: 'directory', icon: '/icons/documents.png', status: 'active' },
    '/Images': { path: '/Images', name: 'Images', isDirectory: true, type: 'directory', icon: '/icons/images.png', status: 'active' },
    '/Music': { path: '/Music', name: 'Music', isDirectory: true, type: 'directory-virtual', icon: '/icons/sounds.png', status: 'active' },
    '/Videos': { path: '/Videos', name: 'Videos', isDirectory: true, type: 'directory-virtual', icon: '/icons/movies.png', status: 'active' },
    '/Sites': { path: '/Sites', name: 'Sites', isDirectory: true, type: 'directory-virtual', icon: '/icons/sites.png', status: 'active' },
    '/Trash': { path: '/Trash', name: 'Trash', isDirectory: true, type: 'directory', icon: '/icons/trash-empty.png', status: 'active' },
  };

  // Add initial documents structure using local data
  INITIAL_DOCUMENTS_DATA.forEach(doc => {
    const path = `/Documents/${doc.name}`;
    initialState[path] = {
      path: path,
      name: doc.name,
      isDirectory: false,
      type: getFileTypeFromName(doc.name),
      icon: '/icons/file-text.png',
      status: 'active',
    };
  });

  // Add initial applications structure (adjust if needed based on appRegistry)
  // Example: Add TextEdit app metadata
  // initialState['/Applications/TextEdit'] = { path: '/Applications/TextEdit', name: 'TextEdit', isDirectory: false, type: 'application', appId: 'textedit', icon: '/icons/apps/textedit.png' };

  return initialState;
};

const STORE_VERSION = 2;
const STORE_NAME = "ryos:files";

export const useFilesStore = create<FilesStoreState>()(
  persist(
    (set, get) => ({
      items: getInitialFileSystemState(),

      addItem: (itemData) => {
        // Add item with default 'active' status
        const newItem: FileSystemItem = { ...itemData, status: 'active' };
        console.log(`[FilesStore:addItem] Attempting to add:`, newItem); // Log item being added
        set((state) => {
          const parentPath = getParentPath(newItem.path);
          if (parentPath !== '/' && (!state.items[parentPath] || !state.items[parentPath].isDirectory || state.items[parentPath].status === 'trashed')) {
              console.warn(`[FilesStore] Cannot add item. Parent directory "${parentPath}" does not exist or is trashed.`);
              return state;
          }
          if (state.items[newItem.path]) {
              console.warn(`[FilesStore] Cannot add item. Path "${newItem.path}" already exists.`);
              return state;
          }
          // Update trash icon if adding to trash (shouldn't happen via addItem, but safety check)
          let updatedItems = { ...state.items, [newItem.path]: newItem };
          if (parentPath === '/Trash' && state.items['/Trash']?.icon !== '/icons/trash-full.png') {
              updatedItems['/Trash'] = { ...state.items['/Trash'], icon: '/icons/trash-full.png' };
          }
          console.log(`[FilesStore:addItem] Successfully added: ${newItem.path}`); // Log success
          return { items: updatedItems };
        });
      },

      // Modified removeItem: Marks as trashed by default, permanently deletes if flag set or already trashed
      removeItem: (path, permanent = false) => {
        set((state) => {
          const itemToRemove = state.items[path];
          if (!itemToRemove) {
            console.warn(`[FilesStore] Cannot remove item. Path "${path}" does not exist.`);
            return state; // Item doesn't exist
          }

          const newItems = { ...state.items };
          const itemsToDelete = [path];
          const deletedContentPaths: string[] = []; // Track paths of deleted file content

          // If it's a directory, find all children
          if (itemToRemove.isDirectory) {
            Object.keys(newItems).forEach(itemPath => {
              if (itemPath.startsWith(path + '/')) {
                itemsToDelete.push(itemPath);
              }
            });
          }

          // Determine if this is a permanent deletion or move to trash
          const isPermanentDelete = permanent || itemToRemove.status === 'trashed';

          itemsToDelete.forEach(p => {
            const currentItem = newItems[p];
            if (!currentItem) return;

            if (isPermanentDelete) {
              // Actually delete metadata
              if (!currentItem.isDirectory) {
                  deletedContentPaths.push(p); // Mark content for deletion by hook
              }
              delete newItems[p];
            } else if (currentItem.status === 'active') {
              // Mark as trashed
              newItems[p] = {
                ...currentItem,
                status: 'trashed',
                originalPath: p,
                deletedAt: Date.now(),
              };
            }
          });

          // Update trash icon state
          const trashIsEmpty = Object.values(newItems).every(item => item.status !== 'trashed');
          if (newItems['/Trash']) {
              newItems['/Trash'] = {
                  ...newItems['/Trash'],
                  icon: trashIsEmpty ? '/icons/trash-empty.png' : '/icons/trash-full.png'
              };
          }

          return { items: newItems };
        });
        // Note: We don't return deletedContentPaths here, hook needs to manage content separately
      },

      restoreItem: (path) => {
        set((state) => {
            const itemToRestore = state.items[path];
            if (!itemToRestore || itemToRestore.status !== 'trashed') {
                console.warn(`[FilesStore] Cannot restore item. Path "${path}" not found or not in trash.`);
                return state;
            }

            const newItems = { ...state.items };
            const itemsToRestore = [path];

            // If it's a directory, find all children marked as trashed *within this original path*
            if (itemToRestore.isDirectory) {
                Object.keys(newItems).forEach(itemPath => {
                    if (itemPath.startsWith(path + '/') && newItems[itemPath]?.status === 'trashed') {
                        itemsToRestore.push(itemPath);
                    }
                });
            }

            itemsToRestore.forEach(p => {
                const currentItem = newItems[p];
                if (currentItem && currentItem.status === 'trashed') {
                    newItems[p] = {
                        ...currentItem,
                        status: 'active',
                        originalPath: undefined,
                        deletedAt: undefined,
                    };
                }
            });

            // Update trash icon state
            const trashIsEmpty = Object.values(newItems).every(item => item.status !== 'trashed');
            if (newItems['/Trash']) {
                newItems['/Trash'] = {
                    ...newItems['/Trash'],
                    icon: trashIsEmpty ? '/icons/trash-empty.png' : '/icons/trash-full.png'
                };
            }

            return { items: newItems };
        });
      },

      emptyTrash: () => {
        const trashedItems = get().getTrashItems();
        const contentPathsToDelete: string[] = [];
        trashedItems.forEach(item => {
            get().removeItem(item.path, true); // Call internal remove with permanent flag
            if (!item.isDirectory) {
                contentPathsToDelete.push(item.name); // Collect names for content deletion
            }
        });
        return contentPathsToDelete; // Return names of files whose content should be deleted
      },

      renameItem: (oldPath, newPath, newName) => {
         set((state) => {
            const itemToRename = state.items[oldPath];
            // Only allow renaming active items
            if (!itemToRename || itemToRename.status !== 'active') {
                console.warn(`[FilesStore] Cannot rename item. Path "${oldPath}" not found or not active.`);
                return state;
            }
            if (state.items[newPath]) {
                console.warn(`[FilesStore] Cannot rename item. New path "${newPath}" already exists.`);
                return state;
            }

            const newItems = { ...state.items };
            delete newItems[oldPath]; // Remove old entry

            const updatedItem = { ...itemToRename, path: newPath, name: newName };
            newItems[newPath] = updatedItem;

            // If it's a directory, rename all children paths (including trashed ones within)
            if (itemToRename.isDirectory) {
                Object.keys(state.items).forEach(itemPath => {
                    if (itemPath.startsWith(oldPath + '/')) {
                        const relativePath = itemPath.substring(oldPath.length);
                        const childNewPath = newPath + relativePath;
                        const childItem = state.items[itemPath];
                        delete newItems[itemPath];
                        // Update originalPath if the child is trashed
                        const updatedOriginalPath = childItem.status === 'trashed' ? childNewPath : undefined;
                        newItems[childNewPath] = {
                             ...childItem,
                             path: childNewPath,
                             originalPath: updatedOriginalPath
                        };
                    }
                });
            }

            return { items: newItems };
         });
      },

      moveItem: (sourcePath, destinationPath) => {
        let success = false;
        set((state) => {
          const sourceItem = state.items[sourcePath];
          if (!sourceItem || sourceItem.status !== 'active') {
            console.warn(`[FilesStore] Cannot move item. Source path "${sourcePath}" not found or not active.`);
            return state;
          }

          const destinationParent = getParentPath(destinationPath);
          if (!state.items[destinationParent] || !state.items[destinationParent].isDirectory) {
            console.warn(`[FilesStore] Cannot move item. Destination parent "${destinationParent}" not found or not a directory.`);
            return state;
          }

          if (state.items[destinationPath]) {
            console.warn(`[FilesStore] Cannot move item. Destination path "${destinationPath}" already exists.`);
            return state;
          }

          // Check if we're trying to move a directory to its own subdirectory
          if (sourceItem.isDirectory && destinationPath.startsWith(sourcePath + '/')) {
            console.warn(`[FilesStore] Cannot move directory into its own subdirectory.`);
            return state;
          }

          const newItems = { ...state.items };
          
          // Remove source entry
          delete newItems[sourcePath];
          
          // Add destination entry
          const movedItem = { ...sourceItem, path: destinationPath };
          newItems[destinationPath] = movedItem;
          
          // If it's a directory, move all its children
          if (sourceItem.isDirectory) {
            Object.keys(state.items).forEach(itemPath => {
              if (itemPath.startsWith(sourcePath + '/')) {
                const relativePath = itemPath.substring(sourcePath.length);
                const childNewPath = destinationPath + relativePath;
                const childItem = state.items[itemPath];
                
                delete newItems[itemPath];
                
                newItems[childNewPath] = {
                  ...childItem,
                  path: childNewPath
                };
              }
            });
          }
          
          success = true;
          return { items: newItems };
        });
        
        return success;
      },

      getItemsInPath: (path) => {
        const allItems = Object.values(get().items);

        if (path === '/') {
            // Special case for root: Return top-level active directories/virtual directories
            return allItems.filter(item =>
                item.status === 'active' &&
                item.path !== '/' && // Exclude the root item itself
                getParentPath(item.path) === '/' // Ensure it's a direct child of root
            );
        }

        if (path === '/Trash') {
            // Show only top-level *trashed* items (items originally from root or elsewhere)
            // Let's refine this: show items whose *originalPath* parent was root, or items directly trashed?
            // For now, let's show all items *marked* as trashed, regardless of original location depth.
            // The UI might need adjustment if we only want top-level trash display.
             return allItems.filter(item => item.status === 'trashed');
        }

        // For regular paths, show only direct children that are active
        return allItems.filter(item => item.status === 'active' && getParentPath(item.path) === path);
      },

      getItem: (path) => get().items[path],

      getTrashItems: () => {
          return Object.values(get().items).filter(item => item.status === 'trashed');
      },

      reset: () => set({ items: getInitialFileSystemState() }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items, // Persist the entire file structure
      }),
      // Basic migration for adding status field
      migrate: (persistedState, version) => {
          if (version < 2) {
              const oldState = persistedState as any;
              const newState: Record<string, FileSystemItem> = {};
              for (const path in oldState.items) {
                  newState[path] = {
                      ...oldState.items[path],
                      status: 'active' // Add default status
                  };
              }
              // Ensure /Trash exists with active status
              if (!newState['/Trash']) {
                  newState['/Trash'] = { path: '/Trash', name: 'Trash', isDirectory: true, type: 'directory', icon: '/icons/trash-empty.png', status: 'active' };
              }
              return { items: newState };
          }
          return persistedState as FilesStoreState;
      },
    }
  )
); 