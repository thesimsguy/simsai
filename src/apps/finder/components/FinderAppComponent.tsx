import { WindowFrame } from "@/components/layout/WindowFrame";
import { FinderMenuBar, ViewType, SortType } from "./FinderMenuBar";
import { AppProps } from "@/apps/base/types";
import { useState, useRef, useEffect } from "react";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { FileList } from "./FileList";
import { useFileSystem, dbOperations, STORES } from "../hooks/useFileSystem";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { appMetadata, helpItems } from "../index";
import { calculateStorageSpace } from "@/utils/storage";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { FileItem } from "./FileList";

// Helper function to determine file type from FileItem
const getFileType = (file: FileItem): string => {
  // Check for directory first
  if (file.isDirectory) {
    return "Folder";
  }

  // Check for specific known virtual types *before* appId
  if (file.type === "Music") return "MP3 Audio File";
  if (file.type === "Video") return "QuickTime Movie";
  if (file.type === "site-link") return "Internet Shortcut";

  // Check for application
  if (file.appId) {
    return "Application";
  }

  // Now check extension from file.name
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "png":
      return "PNG Image";
    case "jpg":
    case "jpeg":
      return "JPEG Image";
    case "gif":
      return "GIF Image";
    case "webp":
      return "WebP Image";
    case "bmp":
      return "Bitmap Image";
    case "md":
      return "Markdown Document";
    case "txt":
      return "Text Document";
    case "mp3":
      return "MP3 Audio File";
    case "mov":
      return "QuickTime Movie";
    default:
      return "Unknown";
  }
};

export function FinderAppComponent({
  onClose,
  isWindowOpen,
  isForeground = true,
  skipInitialSound,
}: AppProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [viewType, setViewType] = useState<ViewType>(
    (localStorage.getItem("finder_view_type") as ViewType) || "list"
  );
  const [sortType, setSortType] = useState<SortType>(
    (localStorage.getItem("finder_sort_type") as SortType) || "name"
  );
  const pathInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [storageSpace, setStorageSpace] = useState(calculateStorageSpace());
  const textEditStore = useTextEditStore();
  const fileStore = useFilesStore();

  // Get all functionality from useFileSystem hook
  const {
    currentPath,
    files,
    selectedFile,
    isLoading,
    error,
    handleFileOpen: originalHandleFileOpen,
    handleFileSelect,
    navigateUp,
    navigateToPath,
    moveToTrash,
    restoreFromTrash,
    emptyTrash,
    trashItemsCount,
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    saveFile: originalSaveFile,
    renameFile: originalRenameFile,
    createFolder,
    moveFile,
  } = useFileSystem();

  // Wrap the original handleFileOpen to integrate with TextEditStore
  const handleFileOpen = async (file: any) => {
    // --- DEBUG LOGGING START ---
    console.log("[Finder] handleFileOpen called with:", {
      name: file.name,
      path: file.path,
      isDirectory: file.isDirectory,
      type: file.type,
      appId: file.appId,
      data: file.data,
    });
    // --- DEBUG LOGGING END ---

    // Let the original handler do its work, but also update TextEditStore
    // for text documents
    originalHandleFileOpen(file);

    // If this is a document, also update TextEditStore
    if (file.path?.startsWith("/Documents/") && !file.isDirectory) {
      try {
        // Get the document to ensure we have the latest content
        const doc = await dbOperations.get<any>(STORES.DOCUMENTS, file.name);
        if (doc) {
          // Update TextEditStore with the file path
          textEditStore.setLastFilePath(file.path);
          textEditStore.setHasUnsavedChanges(false);
          
          // Try to parse the content as JSON if possible
          if (typeof doc.content === 'string') {
            try {
              const jsonContent = JSON.parse(doc.content);
              textEditStore.setContentJson(jsonContent);
            } catch (e) {
              // Not JSON content, will be handled by TextEdit when it loads
            }
          }
        }
      } catch (err) {
        console.error("Error updating TextEditStore:", err);
      }
    }
  };

  // Wrap the original saveFile to integrate with TextEditStore
  const saveFile = async (file: any) => {
    // Call the original saveFile function
    await originalSaveFile(file);

    // If this is a document and it matches the currently open document in TextEdit,
    // update the TextEditStore to mark changes as saved
    if (file.path?.startsWith("/Documents/") && textEditStore.lastFilePath === file.path) {
      textEditStore.setHasUnsavedChanges(false);
    }
  };

  // Update storage space periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setStorageSpace(calculateStorageSpace());
    }, 15000); // Update every 15 seconds

    return () => clearInterval(interval);
  }, []);

  // Handle initial path from launch event
  useEffect(() => {
    const initialPath = localStorage.getItem("app_finder_initialPath");
    if (initialPath) {
      navigateToPath(initialPath);
      localStorage.removeItem("app_finder_initialPath");
    }
  }, [navigateToPath]);

  // Save view and sort preferences when they change
  useEffect(() => {
    localStorage.setItem("finder_view_type", viewType);
  }, [viewType]);

  useEffect(() => {
    localStorage.setItem("finder_sort_type", sortType);
  }, [sortType]);

  const sortedFiles = [...files].sort((a, b) => {
    switch (sortType) {
      case "name":
        return a.name.localeCompare(b.name);
      case "kind": {
        // Sort by directory first, then by file extension
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        const extA = a.name.split(".").pop() || "";
        const extB = b.name.split(".").pop() || "";
        return extA.localeCompare(extB) || a.name.localeCompare(b.name);
      }
      case "size":
        // For now, directories are considered smaller than files
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return 0;
      case "date":
        // We'll need to add date metadata to FileItem to properly implement this
        return 0;
      default:
        return 0;
    }
  });

  // Function to decode URL-encoded path for display
  const getDisplayPath = (path: string): string => {
    // Split path by segments and decode each segment
    return path
      .split('/')
      .map(segment => {
        try {
          return segment ? decodeURIComponent(segment) : segment;
        } catch (e) {
          return segment; // If decoding fails, return as-is
        }
      })
      .join('/');
  };

  const handleEmptyTrash = () => {
    setIsEmptyTrashDialogOpen(true);
  };

  const confirmEmptyTrash = () => {
    emptyTrash();
    setIsEmptyTrashDialogOpen(false);
  };

  // External file drop handler (from outside the app)
  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    // Only handle external files (from the user's disk)
    // If no files in dataTransfer, this might be an internal move which is handled by FileList
    if (e.dataTransfer.files.length === 0) {
      return;
    }

    // Only allow drops in the Documents directory
    if (currentPath !== "/Documents") {
      return;
    }

    const file = e.dataTransfer.files[0];
    if (file) {
      // Only accept text and markdown files
      if (!file.type.startsWith("text/") && !file.name.endsWith(".md")) {
        return;
      }

      try {
        const text = await file.text();
        const filePath = `/Documents/${file.name}`;

        await saveFile({
          name: file.name,
          path: filePath,
          content: text,
        });

        // Notify file was added
        const event = new CustomEvent("fileUpdated", {
          detail: {
            name: file.name,
            path: filePath,
          },
        });
        window.dispatchEvent(event);
      } catch (err) {
        console.error("Error saving dropped file:", err);
      }
    }
  };

  // Internal file move handler (between folders in the app)
  const handleFileMoved = (sourceFile: FileItem, targetFolder: FileItem) => {
    if (!canCreateFolder) {
      console.warn("File movement is not allowed in this directory");
      return;
    }
    
    if (!sourceFile || !targetFolder || !targetFolder.isDirectory) {
      console.warn("Invalid source or target for file move");
      return;
    }
    
    // Get the file from the filesystem using the path
    const sourceItem = fileStore.getItem(sourceFile.path);
    if (!sourceItem) {
      console.error(`Source file not found at path: ${sourceFile.path}`);
      return;
    }
    
    // Construct the destination path
    const destinationPath = `${targetFolder.path}/${sourceFile.name}`;
    
    // Execute the move
    console.log(`Moving file from ${sourceFile.path} to ${destinationPath}`);
    moveFile(sourceItem, targetFolder.path);
  };

  // Handler for dropping files directly into the current directory
  const handleDropToCurrentDirectory = (sourceFile: FileItem) => {
    if (!canCreateFolder) {
      console.warn("File movement is not allowed in this directory");
      return;
    }
    
    if (!sourceFile) {
      console.warn("Invalid source file for move");
      return;
    }
    
    // Get source file from store
    const sourceItem = fileStore.getItem(sourceFile.path);
    if (!sourceItem) {
      console.error(`Source file not found at path: ${sourceFile.path}`);
      return;
    }
    
    // Don't move a file to the directory it's already in
    if (getParentPath(sourceFile.path) === currentPath) {
      console.warn(`File ${sourceFile.name} is already in ${currentPath}`);
      return;
    }
    
    console.log(`Moving file from ${sourceFile.path} to ${currentPath}/${sourceFile.name}`);
    moveFile(sourceItem, currentPath);
  };

  // Helper to get parent path
  const getParentPath = (path: string): string => {
    if (path === '/') return '/';
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 1) return '/';
    return '/' + parts.slice(0, -1).join('/');
  };

  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Only accept text and markdown files
      if (!file.type.startsWith("text/") && !file.name.endsWith(".md")) {
        return;
      }

      try {
        const text = await file.text();
        // Ensure path is correct for current directory
        const basePath = currentPath === '/' ? '' : currentPath;
        const filePath = `${basePath}/${file.name}`;

        await saveFile({
          name: file.name,
          path: filePath,
          content: text,
        });

        // Notify file was added
        const event = new CustomEvent("fileUpdated", {
          detail: {
            name: file.name,
            path: filePath,
          },
        });
        window.dispatchEvent(event);

        // Clear the input
        e.target.value = "";
      } catch (err) {
        console.error("Error importing file:", err);
      }
    }
  };

  const handleRename = () => {
    if (!selectedFile) return;
    setRenameValue(selectedFile.name);
    setIsRenameDialogOpen(true);
  };

  const handleRenameSubmit = async (newName: string) => {
    if (!selectedFile || !newName || !newName.trim()) return;
    const trimmedNewName = newName.trim();
    if (selectedFile.name === trimmedNewName) {
      setIsRenameDialogOpen(false);
      return;
    }

    const basePath = currentPath === '/' ? '' : currentPath;
    const oldPathForRename = `${basePath}/${selectedFile.name}`;
    await originalRenameFile(oldPathForRename, trimmedNewName);

    // Update TextEditStore if needed
    if (textEditStore.lastFilePath === oldPathForRename) {
      const newPathForRename = `${basePath}/${trimmedNewName}`;
      textEditStore.setLastFilePath(newPathForRename);
    }

    // Dispatch rename event
    const event = new CustomEvent("fileRenamed", {
      detail: {
        oldPath: oldPathForRename,
        newPath: `${basePath}/${trimmedNewName}`,
        oldName: selectedFile.name,
        newName: trimmedNewName,
      },
    });
    window.dispatchEvent(event);

    setIsRenameDialogOpen(false);
  };

  const handleDuplicate = async () => {
    if (!selectedFile || selectedFile.isDirectory) return; // Can only duplicate files
    try {
        // Create a copy name
        const ext = selectedFile.name.includes(".") ? `.${selectedFile.name.split(".").pop()}` : "";
        const baseName = selectedFile.name.replace(ext, "");
        let copyIndex = 1;
        let copyName = `${baseName} copy${ext}`;
        // Fix path construction here
        const basePath = currentPath === '/' ? '' : currentPath;
        let copyPath = `${basePath}/${copyName}`;

        // Ensure unique name
        while (fileStore.getItem(copyPath)) {
            copyIndex++;
            copyName = `${baseName} copy ${copyIndex}${ext}`;
            copyPath = `${basePath}/${copyName}`;
        }

        // Fetch content for the selected file
        let contentToCopy: string | Blob | undefined;
        // Determine store based on selectedFile.path, not currentPath
        const storeName = selectedFile.path.startsWith("/Documents/") ? STORES.DOCUMENTS : selectedFile.path.startsWith("/Images/") ? STORES.IMAGES : null;
        if (storeName) {
            const contentData = await dbOperations.get<any>(storeName, selectedFile.name); // Use any type for simplicity here
            if (contentData) {
                contentToCopy = contentData.content;
            }
        }

        if (contentToCopy === undefined) {
            console.error("Could not retrieve content for duplication:", selectedFile.path);
            return; // Or show an error
        }

        // Use saveFile to create the duplicate
        await saveFile({
            name: copyName,
            path: copyPath,
            content: contentToCopy,
            type: selectedFile.type,
        });

        // Select the new file (optional)
        // Need to get the updated files list from the hook/store to find the new item
        // This might require a slight delay or relying on the store update triggering a re-render
        // For now, let's skip auto-selection after duplication to avoid complexity.
        // const newItem = files.find(f => f.path === copyPath);
        // if (newItem) {
        //     originalSetSelectedFile(newItem);
        // }

    } catch (err) {
        console.error("Error duplicating file:", err);
    }
  };

  const handleRestore = () => {
    if (!selectedFile) return;
    // restoreFromTrash now expects the DisplayFileItem from the UI
    restoreFromTrash(selectedFile);
  };

  // --- New Folder State & Handlers --- //
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("untitled folder");

  const handleNewFolder = () => {
      // Find a unique default name
      let folderIndex = 0;
      let defaultName = "untitled folder";
      const basePath = currentPath === '/' ? '' : currentPath;
      let folderPath = `${basePath}/${defaultName}`;
      while (fileStore.getItem(folderPath)) {
          folderIndex++;
          defaultName = `untitled folder ${folderIndex}`;
          folderPath = `${basePath}/${defaultName}`;
      }
      setNewFolderName(defaultName);
      setIsNewFolderDialogOpen(true);
  };

  const handleNewFolderSubmit = (name: string) => {
      if (!name || !name.trim()) return;
      const trimmedName = name.trim();
      const basePath = currentPath === '/' ? '' : currentPath;
      const newPath = `${basePath}/${trimmedName}`;

      // Use the createFolder function from the hook
      createFolder({ path: newPath, name: trimmedName });

      // No need to manually add to fileStore here
      // const newFolderItem: FileSystemItem = { ... };
      // fileStore.addItem(newFolderItem);

      setIsNewFolderDialogOpen(false);
  };

  // Determine if folder creation (and thus file movement) is allowed in the current path
  const canCreateFolder = currentPath === '/Documents' || currentPath === '/Images' || currentPath.startsWith('/Documents/') || currentPath.startsWith('/Images/');

  // Get all root folders for the Go menu using fileStore
  // This will always show root folders regardless of current path
  const rootFolders = fileStore.getItemsInPath('/').filter(item => 
    item.isDirectory && 
    item.path !== '/Trash' // We'll add Trash separately in the menu
  ).map(item => ({
    name: item.name,
    isDirectory: true,
    path: item.path,
    icon: item.icon || '/icons/folder.png'
  }));

  // Add a new handler for rename requests
  const handleRenameRequest = (file: FileItem) => {
    // Only allow rename in paths where file creation is allowed
    if (!canCreateFolder) return;
    
    // Prevent renaming virtual files and special folders
    if (file.type?.includes('virtual') || 
        file.path === '/Documents' || 
        file.path === '/Images' || 
        file.path === '/Applications' ||
        file.path === '/Trash' ||
        file.path === '/Music' ||
        file.path === '/Videos' ||
        file.path === '/Sites') {
      return;
    }
    
    // Set rename value and open the dialog
    setRenameValue(file.name);
    setIsRenameDialogOpen(true);
  };

  if (!isWindowOpen) return null;

  return (
    <>
      <FinderMenuBar
        onClose={onClose}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        viewType={viewType}
        onViewTypeChange={setViewType}
        sortType={sortType}
        onSortTypeChange={setSortType}
        selectedFile={selectedFile}
        onMoveToTrash={moveToTrash}
        onEmptyTrash={handleEmptyTrash}
        onRestore={handleRestore}
        isTrashEmpty={trashItemsCount === 0}
        isInTrash={Boolean(selectedFile?.path.startsWith("/Trash"))}
        onNavigateBack={navigateBack}
        onNavigateForward={navigateForward}
        canNavigateBack={canNavigateBack()}
        canNavigateForward={canNavigateForward()}
        onNavigateToPath={navigateToPath}
        onImportFile={handleImportFile}
        onRename={handleRename}
        onDuplicate={handleDuplicate}
        onNewFolder={handleNewFolder}
        canCreateFolder={canCreateFolder}
        rootFolders={rootFolders}
      />
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".txt,.md,text/*"
        onChange={handleFileInputChange}
      />
      <WindowFrame
        appId="finder"
        title={
          currentPath === "/"
            ? "Macintosh HD"
            : (() => {
                // Get the last path segment and decode it
                const lastSegment = currentPath.split("/").filter(Boolean).pop() || "";
                try {
                  return decodeURIComponent(lastSegment) || "Finder";
                } catch (e) {
                  return lastSegment || "Finder";
                }
              })()
        }
        onClose={onClose}
        isForeground={isForeground}
        skipInitialSound={skipInitialSound}
      >
        <div
          className={`flex flex-col h-full w-full bg-white relative ${
            isDraggingOver && currentPath === "/Documents"
              ? "after:absolute after:inset-0 after:bg-black/20"
              : ""
          }`}
          onDragOver={(e) => {
            // Only handle external file drags, not internal file moves
            if (e.dataTransfer.types.includes("Files") && e.dataTransfer.files.length > 0) {
              e.preventDefault();
              e.stopPropagation();
              if (!isDraggingOver && currentPath === "/Documents") {
                setIsDraggingOver(true);
              }
            }
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Check if we're leaving to a child element
            const relatedTarget = e.relatedTarget as Node | null;
            if (e.currentTarget.contains(relatedTarget)) {
              return;
            }
            setIsDraggingOver(false);
          }}
          onDragEnd={() => setIsDraggingOver(false)}
          onMouseLeave={() => setIsDraggingOver(false)}
          onDrop={handleFileDrop}
        >
          <div className="flex flex-col gap-1 p-1 bg-gray-100 border-b border-black">
            <div className="flex gap-2 items-center">
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateBack}
                  disabled={!canNavigateBack()}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateForward}
                  disabled={!canNavigateForward()}
                  className="h-8 w-8"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateUp}
                  disabled={currentPath === "/"}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4 rotate-90" />
                </Button>
              </div>
              <Input
                ref={pathInputRef}
                value={getDisplayPath(currentPath)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  navigateToPath(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    navigateToPath((e.target as HTMLInputElement).value);
                  }
                }}
                className="flex-1"
                placeholder="Enter path"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                Loading...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-500">
                {error}
              </div>
            ) : (
              <FileList
                files={sortedFiles}
                onFileOpen={handleFileOpen}
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
                viewType={viewType}
                getFileType={getFileType}
                onFileDrop={handleFileMoved}
                onDropToCurrentDirectory={handleDropToCurrentDirectory}
                canDropFiles={canCreateFolder}
                currentPath={currentPath}
                onRenameRequest={handleRenameRequest}
              />
            )}
          </div>
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-geneva-12 bg-gray-100 border-t border-gray-300">
            <span>
              {sortedFiles.length} item{sortedFiles.length !== 1 ? "s" : ""}
            </span>
            <span>
              {Math.round((storageSpace.available / 1024 / 1024) * 10) / 10} MB
              available
            </span>
          </div>
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appName="Finder"
        helpItems={helpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
      />
      <ConfirmDialog
        isOpen={isEmptyTrashDialogOpen}
        onOpenChange={setIsEmptyTrashDialogOpen}
        onConfirm={confirmEmptyTrash}
        title="Empty Trash"
        description="Are you sure you want to empty the Trash? This action cannot be undone."
      />
      <InputDialog
        isOpen={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        onSubmit={handleRenameSubmit}
        title="Rename Item"
        description={`Enter a new name for "${selectedFile?.name || 'item'}"`}
        value={renameValue}
        onChange={setRenameValue}
      />
      <InputDialog
        isOpen={isNewFolderDialogOpen}
        onOpenChange={setIsNewFolderDialogOpen}
        onSubmit={handleNewFolderSubmit}
        title="New Folder"
        description="Enter a name for the new folder:"
        value={newFolderName}
        onChange={setNewFolderName}
      />
    </>
  );
}
