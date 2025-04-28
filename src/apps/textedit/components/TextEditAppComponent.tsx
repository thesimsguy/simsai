import { useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { TextEditMenuBar } from "./TextEditMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata, helpItems } from "..";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { SlashCommands } from "../extensions/SlashCommands";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { dbOperations, STORES, DocumentContent } from "@/apps/finder/hooks/useFileSystem";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AudioInputButton } from "@/components/ui/audio-input-button";
import { ChevronDown } from "lucide-react";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useSound, Sounds } from "@/hooks/useSound";
import { htmlToMarkdown, markdownToHtml, htmlToPlainText } from "@/utils/markdown";
import { saveAsMarkdown } from "@/utils/markdown/saveUtils";
import { useAppStore } from "@/stores/useAppStore";

// Function to remove file extension
const removeFileExtension = (filename: string): string => {
  return filename.replace(/\.[^/.]+$/, "");
};

// Function to safely convert file content (string or Blob) to string
const getContentAsString = async (
  content: string | Blob | undefined
): Promise<string> => {
  if (!content) return "";
  if (content instanceof Blob) {
    return await content.text();
  }
  return content;
};

// Helper function to extract filename from path
const getFileNameFromPath = (path: string): string => {
  return path.split("/").pop() || "";
};

export function TextEditAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
}: AppProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isConfirmNewDialogOpen, setIsConfirmNewDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { saveFile } = useFileSystem("/Documents");
  const launchApp = useLaunchApp();
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const clearInitialData = useAppStore((state) => state.clearInitialData);

  // Zustand TextEdit store
  const {
    lastFilePath: currentFilePath,
    setLastFilePath,
    setContentJson,
    hasUnsavedChanges,
    setHasUnsavedChanges,
  } = useTextEditStore();

  // Alias for existing code references
  const setCurrentFilePath = setLastFilePath;

  // Local UI-only state for Save dialog filename
  const [saveFileName, setSaveFileName] = useState("");
  const editorContentRef = useRef<string>(""); // Ref to store latest markdown content for debounced save

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      SlashCommands,
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm prose-neutral max-w-none focus:outline-none p-4 [&>ul]:list-disc [&>ol]:list-decimal [&>*]:my-1 [&>p]:leading-5 [&>h1]:mt-3 [&>h1]:mb-2 [&>h2]:mt-2 [&>h2]:mb-1 [&>ul]:my-1 [&>ol]:my-1 [&>ul>li]:my-0.5 [&>ol>li]:my-0.5 [&>ul]:pl-0 [&>ol]:pl-4 [&>ul>li>p]:my-0 [&>ol>li>p]:my-0 [&>ul>li]:pl-0 [&>ol>li]:pl-0 [&>ul>li]:marker:text-neutral-900 [&>ol>li]:marker:text-neutral-900 [&>ul[data-type='taskList']]:ml-0 [&>ul[data-type='taskList']]:list-none [&>ul[data-type='taskList']>li]:flex [&>ul[data-type='taskList']>li]:items-start [&>ul[data-type='taskList']>li>label]:mr-2 [&>ul[data-type='taskList']>li>label>input]:mt-1 [&>ul[data-type='taskList']>li>div]:flex-1 [&>ul[data-type='taskList']>li>div>p]:my-0 [&>ul>li>ul]:pl-1 [&>ol>li>ol]:pl-1 [&>ul>li>ol]:pl-1 [&>ol>li>ul]:pl-1 [&>ul>li>ul]:my-0 [&>ol>li>ol]:my-0 [&>ul>li>ul>li>p]:my-0 min-h-full font-geneva-12 text-[12px] [&>h1]:text-[24px] [&>h2]:text-[20px] [&>h3]:text-[16px] [&>h1]:font-['ChicagoKare'] [&>h2]:font-['ChicagoKare'] [&>h3]:font-['ChicagoKare']",
      },
    },
    onUpdate: ({ editor }) => {
      // Only mark changes and store latest content/JSON in onUpdate
      const currentJson = editor.getJSON();
      setContentJson(currentJson); // Update store JSON for recovery
      editorContentRef.current = htmlToMarkdown(editor.getHTML()); // Store latest markdown
      if (!hasUnsavedChanges) {
        setHasUnsavedChanges(true);
      }
    },
  });

  // --- Debounced Autosave Effect --- //
  useEffect(() => {
    // Only run if there are changes and a file path exists
    if (hasUnsavedChanges && currentFilePath) {
      console.log("[TextEdit] Changes detected, scheduling autosave for:", currentFilePath);
      const handler = setTimeout(async () => {
        console.log("[TextEdit] Autosaving:", currentFilePath);
        const fileName = currentFilePath.split("/").pop() || "Untitled";
        try {
          await saveFile({
            name: fileName,
            path: currentFilePath,
            content: editorContentRef.current, // Save the latest markdown content from ref
          });
          setHasUnsavedChanges(false); // Mark as saved after successful save
          console.log("[TextEdit] Autosave successful:", currentFilePath);
        } catch (error) {
            console.error("[TextEdit] Autosave failed:", error);
            // Optionally notify user or leave hasUnsavedChanges true
        }
      }, 1500); // Autosave after 1.5 seconds of inactivity

      // Cleanup function to clear timeout if changes occur before saving
      return () => {
        console.log("[TextEdit] Keystroke detected, clearing autosave timeout.");
        clearTimeout(handler);
      };
    }
  }, [hasUnsavedChanges, currentFilePath, saveFile]); // Dependencies: trigger on change flag or path change
  // --- End Autosave Effect --- //

  // Initial load - Restore last session or use initialData
  useEffect(() => {
    if (!editor) return;

    const loadContent = async () => {
        // Prioritize initialData passed from launch event
        if (initialData?.path && initialData?.content !== undefined) {
            console.log("[TextEdit] Loading content from initialData:", initialData.path);
            const { path, content } = initialData;
            const contentToUse = typeof content === "string" ? content : "";
            let editorContent: string | object;

            if (path.endsWith(".md")) {
                editorContent = markdownToHtml(contentToUse);
            } else {
                try {
                    editorContent = JSON.parse(contentToUse);
                } catch {
                    editorContent = `<p>${contentToUse}</p>`;
                }
            }

            editor.commands.setContent(editorContent, false);
            setCurrentFilePath(path);
            setHasUnsavedChanges(false);
            setLastFilePath(path);
            setContentJson(editor.getJSON());

            // Clear the initialData from the store now that we've consumed it
            clearInitialData('textedit');
            return; // Don't proceed to load from store/DB if initialData was used
        }

        // If no initialData, load from store/DB as before
        const { lastFilePath, contentJson } = useTextEditStore.getState();
        let loadedContent = false;

        if (lastFilePath?.startsWith("/Documents/")) {
          try {
            const fileName = getFileNameFromPath(lastFilePath);
            const doc = await dbOperations.get<DocumentContent>(STORES.DOCUMENTS, fileName);

            if (doc?.content) {
              const contentStr = await getContentAsString(doc.content);
              let editorContent;

              if (lastFilePath.endsWith(".md")) {
                editorContent = markdownToHtml(contentStr);
              } else {
                // Try parsing as JSON first (legacy format?)
                try {
                  editorContent = JSON.parse(contentStr);
                } catch {
                  // Fallback to plain text wrapped in paragraph
                  editorContent = `<p>${contentStr}</p>`;
                }
              }
              
              if (editorContent) {
                editor.commands.setContent(editorContent, false); // Set false to avoid triggering onUpdate
                setHasUnsavedChanges(false);
                loadedContent = true;
                console.log("Loaded content from file:", lastFilePath);
              }
            } else {
               console.warn("Document not found or empty:", lastFilePath);
            }
          } catch (err) {
            console.error("Error loading file content from DB:", err);
          }
        }
        
        // Fallback to stored JSON if file load failed or no path was set
        if (!loadedContent && contentJson) {
           try {
             editor.commands.setContent(contentJson, false); // Set false to avoid triggering onUpdate
             setHasUnsavedChanges(false); // Assume stored JSON is saved state unless proven otherwise
             console.log("Loaded content from store JSON");
           } catch (err) {
             console.warn("Failed to restore stored TextEdit content:", err);
           }
        }
    };

    loadContent();

  }, [editor, initialData]);

  // Add listeners for external document updates (like from Chat app)
  useEffect(() => {
    // Listen for direct content update requests
    const handleUpdateEditorContent = (e: CustomEvent) => {
      if (editor && e.detail?.path === currentFilePath && e.detail?.content) {
        try {
          // Try to parse the content as JSON
          const jsonContent = JSON.parse(e.detail.content);

          // Keep the current cursor position if possible
          const { from, to } = editor.state.selection;

          // Update the content
          editor.commands.setContent(jsonContent);

          // Try to restore cursor position
          if (from && to && from === to) {
            try {
              editor.commands.setTextSelection(
                Math.min(from, editor.state.doc.content.size)
              );
            } catch (e) {
              console.log("Could not restore cursor position", e);
            }
          }

          // Make sure we don't mark this as an unsaved change
          setHasUnsavedChanges(false);

          console.log("Editor content updated from external source");
        } catch (error) {
          console.error("Failed to update editor content:", error);
        }
      }
    };

    // Handle content changed notifications
    const handleContentChanged = (e: CustomEvent) => {
      if (editor && e.detail?.path === currentFilePath) {
        // Reload content from localStorage
        const latest = useTextEditStore.getState().contentJson;
        if (latest) {
          editor.commands.setContent(latest);
            setHasUnsavedChanges(false);
        }
      }
    };

    // Handle document updated notifications
    const handleDocumentUpdated = (e: CustomEvent) => {
      if (editor && e.detail?.path === currentFilePath && e.detail?.content) {
        try {
          const jsonContent = JSON.parse(e.detail.content);
          editor.commands.setContent(jsonContent);
          setHasUnsavedChanges(false);
          console.log("Editor content updated after document updated event");
        } catch (error) {
          console.error(
            "Failed to update editor with document updated event:",
            error
          );
        }
      }
    };

    // Set up event listeners
    window.addEventListener(
      "updateEditorContent",
      handleUpdateEditorContent as EventListener
    );
    window.addEventListener(
      "contentChanged",
      handleContentChanged as EventListener
    );
    window.addEventListener(
      "documentUpdated",
      handleDocumentUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        "updateEditorContent",
        handleUpdateEditorContent as EventListener
      );
      window.removeEventListener(
        "contentChanged",
        handleContentChanged as EventListener
      );
      window.removeEventListener(
        "documentUpdated",
        handleDocumentUpdated as EventListener
      );
    };
  }, [editor, currentFilePath]);

  const handleTranscriptionComplete = (text: string) => {
    setIsTranscribing(false);
    if (editor) {
      // If editor is not focused, focus it first
      if (!editor.isFocused) {
        editor.commands.focus();
      }

      // If there's no selection (cursor position), move to the end and add a new paragraph
      if (editor.state.selection.empty && editor.state.selection.anchor === 0) {
        editor.commands.setTextSelection(editor.state.doc.content.size);
        editor.commands.insertContent("\n");
      }

      // Insert the transcribed text at current cursor position
      editor.commands.insertContent(text);
    }
  };

  const handleTranscriptionStart = () => {
    setIsTranscribing(true);
  };

  const handleNewFile = () => {
    if (editor && hasUnsavedChanges) {
      setIsConfirmNewDialogOpen(true);
    } else {
      createNewFile();
    }
  };

  const createNewFile = () => {
    if (editor) {
      editor.commands.clearContent();
      setContentJson(null);
      setLastFilePath(null);
      setHasUnsavedChanges(false);

      // Check if there's a pending file to open after creating new file
      const pendingFileOpen = localStorage.getItem("pending_file_open");
      if (pendingFileOpen) {
        try {
          const { path, content } = JSON.parse(pendingFileOpen);
          if (path.startsWith("/Documents/")) {
            const processedContent = path.endsWith(".md")
              ? markdownToHtml(content)
              : content;
            editor.commands.setContent(processedContent);
            setCurrentFilePath(path);
            setHasUnsavedChanges(false);
            // Store the file path for next time
            setLastFilePath(path);
            // Store content in case app crashes
            setContentJson(editor.getJSON());
          }
        } catch (e) {
          console.error("Failed to parse pending file open data:", e);
        } finally {
          localStorage.removeItem("pending_file_open");
        }
      }
    }
  };

  const handleSave = () => {
    if (!editor) return;

    if (!currentFilePath) {
      // Get the first line of content and use it as suggested filename
      const content = editor.getHTML();
      const firstLine = content
        .split("\n")[0] // Get first line
        .replace(/<[^>]+>/g, "") // Remove HTML tags
        .split("-")[0] // Split by - and take first part
        .trim() // Remove whitespace
        .replace(/[^a-zA-Z0-9\s-]/g, "") // Remove special characters
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .substring(0, 50); // Limit length

      setIsSaveDialogOpen(true);
      setSaveFileName(`${firstLine || "Untitled"}.md`);
    } else {
      // Use shared utility to save as markdown, passing the saveFile hook
      const { jsonContent } = saveAsMarkdown(editor, {
        name: currentFilePath.split("/").pop() || "Untitled",
        path: currentFilePath
      }, saveFile); // Pass the hook function

      // Store JSON content in case app crashes
      setContentJson(jsonContent);
      
      // Store the file path for next time
      setLastFilePath(currentFilePath);
      
      setHasUnsavedChanges(false);
    }
  };

  const handleSaveSubmit = (fileName: string) => {
    if (!editor) return;

    const filePath = `/Documents/${fileName}${
      fileName.endsWith(".md") ? "" : ".md"
    }`;

    // Use shared utility to save as markdown, passing the saveFile hook
    const { jsonContent } = saveAsMarkdown(editor, {
      name: fileName,
      path: filePath
    }, saveFile); // Pass the hook function

    // Store JSON content in case app crashes (for editor recovery)
    setContentJson(jsonContent);
    
    // Store the file path for next time
    setLastFilePath(filePath);
    
    setCurrentFilePath(filePath);
    setHasUnsavedChanges(false);
    setIsSaveDialogOpen(false);
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file && editor) {
      const text = await file.text();

      // Convert content based on file type
      let editorContent;
      if (file.name.endsWith(".html")) {
        editorContent = text;
      } else if (file.name.endsWith(".md")) {
        editorContent = markdownToHtml(text);
      } else {
        editorContent = `<p>${text}</p>`;
      }

      editor.commands.setContent(editorContent);
      const filePath = `/Documents/${file.name}`;
      
      // Always save in markdown format, converting from HTML if needed
      const markdownContent = file.name.endsWith(".md")
        ? text // Use original markdown if it's already markdown
        : htmlToMarkdown(editor.getHTML()); // Convert to markdown otherwise

      // Use saveFile API directly for file imports
      saveFile({
        name: file.name,
        path: filePath,
        content: markdownContent,
      });

      setCurrentFilePath(filePath);
      setHasUnsavedChanges(false);
      
      // Store JSON for internal recovery
      setContentJson(editor.getJSON());
      
      // Store the file path for next time
      setLastFilePath(filePath);
    }
    
    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExportFile = (format: "html" | "md" | "txt") => {
    if (!editor) return;

    const html = editor.getHTML();
    let content: string;
    let mimeType: string;
    let extension: string;

    switch (format) {
      case "md":
        content = htmlToMarkdown(html);
        mimeType = "text/markdown";
        extension = "md";
        break;
      case "txt":
        content = htmlToPlainText(html);
        mimeType = "text/plain";
        extension = "txt";
        break;
      case "html":
      default:
        content = html;
        mimeType = "text/html";
        extension = "html";
        break;
    }

    // Use "Untitled" as default name for unsaved files
    const filename = currentFilePath
      ? removeFileExtension(currentFilePath.split("/").pop() || "")
      : "Untitled";

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = () => {
    launchApp("finder", { initialPath: "/Documents" });
  };

  // Function to handle dropped files
  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files[0];
    if (file && editor) {
      // Only accept text and markdown files
      if (!file.type.startsWith("text/") && !file.name.endsWith(".md")) {
        return;
      }

      const text = await file.text();

      // Convert content based on file type
      let content;
      if (file.name.endsWith(".html")) {
        content = text;
      } else if (file.name.endsWith(".md")) {
        content = markdownToHtml(text);
      } else {
        content = `<p>${text}</p>`;
      }

      // If there are unsaved changes, prompt the user
      if (hasUnsavedChanges) {
        setIsConfirmNewDialogOpen(true);
        // Store the dropped file temporarily
        localStorage.setItem(
          "pending_file_open",
          JSON.stringify({
            path: `/Documents/${file.name}`,
            content: content,
          })
        );
      } else {
        editor.commands.clearContent();
        editor.commands.setContent(content);
        const filePath = `/Documents/${file.name}`;

        // Save in markdown format
        const markdownContent = file.name.endsWith(".md")
          ? text // Use original markdown if it's already markdown
          : htmlToMarkdown(editor.getHTML()); // Convert to markdown otherwise

        // Save the file using the unified approach
        saveFile({
          name: file.name,
          path: filePath,
          content: markdownContent,
        });

        setCurrentFilePath(filePath);
        setHasUnsavedChanges(false);
        
        // Store JSON for internal recovery
        setContentJson(editor.getJSON());
        
        // Store the file path for next time
        setLastFilePath(filePath);
      }
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".txt,.html,.md,.rtf,.doc,.docx"
        className="hidden"
      />
      <TextEditMenuBar
        editor={editor}
        onClose={onClose}
        isWindowOpen={isWindowOpen}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        onNewFile={handleNewFile}
        onImportFile={handleImportFile}
        onExportFile={handleExportFile}
        onSave={handleSave}
        hasUnsavedChanges={hasUnsavedChanges}
        currentFilePath={currentFilePath}
        handleFileSelect={handleFileSelect}
      />
      <WindowFrame
        title={
          currentFilePath
            ? `${removeFileExtension(currentFilePath.split("/").pop() || "")}`
            : `Untitled${hasUnsavedChanges ? " •" : ""}`
        }
        onClose={onClose}
        isForeground={isForeground}
        appId="textedit"
        skipInitialSound={skipInitialSound}
      >
        <div className="flex flex-col h-full w-full">
          <div
            className={`flex-1 flex flex-col bg-white relative min-h-0 ${
              isDraggingOver
                ? "after:absolute after:inset-0 after:bg-black/20"
                : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isDraggingOver) setIsDraggingOver(true);
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
            <div className="flex bg-[#c0c0c0] border-b border-black w-full flex-shrink-0">
              <div className="flex px-1 py-1 gap-x-1">
                {/* Text style group */}
                <div className="flex">
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleBold().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/bold-${
                        editor?.isActive("bold") ? "depressed" : "off"
                      }.png`}
                      alt="Bold"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleItalic().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/italic-${
                        editor?.isActive("italic") ? "depressed" : "off"
                      }.png`}
                      alt="Italic"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleUnderline().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/underline-${
                        editor?.isActive("underline") ? "depressed" : "off"
                      }.png`}
                      alt="Underline"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* Heading selector */}
                <div className="flex">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="w-[80px] h-[22px] flex items-center justify-between px-2 bg-white border border-[#808080] text-sm">
                        {editor?.isActive("heading", { level: 1 })
                          ? "H1"
                          : editor?.isActive("heading", { level: 2 })
                          ? "H2"
                          : editor?.isActive("heading", { level: 3 })
                          ? "H3"
                          : "Text"}
                        <ChevronDown className="ml-1 h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[80px]">
                      <DropdownMenuItem
                        onClick={() =>
                          editor?.chain().focus().setParagraph().run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("paragraph") ? "bg-gray-200" : ""
                        }`}
                      >
                        Text
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          editor
                            ?.chain()
                            .focus()
                            .toggleHeading({ level: 1 })
                            .run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("heading", { level: 1 })
                            ? "bg-gray-200"
                            : ""
                        }`}
                      >
                        H1
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          editor
                            ?.chain()
                            .focus()
                            .toggleHeading({ level: 2 })
                            .run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("heading", { level: 2 })
                            ? "bg-gray-200"
                            : ""
                        }`}
                      >
                        H2
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          editor
                            ?.chain()
                            .focus()
                            .toggleHeading({ level: 3 })
                            .run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("heading", { level: 3 })
                            ? "bg-gray-200"
                            : ""
                        }`}
                      >
                        H3
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* Alignment group */}
                <div className="flex">
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().setTextAlign("left").run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/align-left-${
                        editor?.isActive({ textAlign: "left" })
                          ? "depressed"
                          : "off"
                      }.png`}
                      alt="Align Left"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().setTextAlign("center").run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/align-center-${
                        editor?.isActive({ textAlign: "center" })
                          ? "depressed"
                          : "off"
                      }.png`}
                      alt="Align Center"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().setTextAlign("right").run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/align-right-${
                        editor?.isActive({ textAlign: "right" })
                          ? "depressed"
                          : "off"
                      }.png`}
                      alt="Align Right"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* List group */}
                <div className="flex">
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleBulletList().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/unordered-list-${
                        editor?.isActive("bulletList") ? "depressed" : "off"
                      }.png`}
                      alt="Bullet List"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleOrderedList().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/ordered-list-${
                        editor?.isActive("orderedList") ? "depressed" : "off"
                      }.png`}
                      alt="Ordered List"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* Voice transcription */}
                <div className="flex">
                  <AudioInputButton
                    onTranscriptionComplete={handleTranscriptionComplete}
                    onTranscriptionStart={handleTranscriptionStart}
                    isLoading={isTranscribing}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                    silenceThreshold={10000}
                  />
                </div>
              </div>
            </div>
            <EditorContent
              editor={editor}
              className="flex-1 overflow-y-auto w-full min-h-0"
            />
          </div>
          <InputDialog
            isOpen={isSaveDialogOpen}
            onOpenChange={setIsSaveDialogOpen}
            onSubmit={handleSaveSubmit}
            title="Save File"
            description="Enter a name for your file"
            value={saveFileName}
            onChange={setSaveFileName}
          />
          <ConfirmDialog
            isOpen={isConfirmNewDialogOpen}
            onOpenChange={setIsConfirmNewDialogOpen}
            onConfirm={() => {
              createNewFile();
              setIsConfirmNewDialogOpen(false);
            }}
            title="Discard Changes"
            description="Do you want to discard your changes and create a new file?"
          />
          <HelpDialog
            isOpen={isHelpDialogOpen}
            onOpenChange={setIsHelpDialogOpen}
            helpItems={helpItems}
            appName="TextEdit"
          />
          <AboutDialog
            isOpen={isAboutDialogOpen}
            onOpenChange={setIsAboutDialogOpen}
            metadata={appMetadata}
          />
        </div>
      </WindowFrame>
    </>
  );
}
