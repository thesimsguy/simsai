import React, { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ShareLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  year: string;
}

export function ShareLinkDialog({
  isOpen,
  onClose,
  url,
  year,
}: ShareLinkDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // A simple encoding function that uses Base64
  function encodeData(url: string, year: string): string {
    // Combine url and year with a separator
    const combined = `${url}|${year}`;
    // Use btoa for client-side Base64 encoding and make it URL-safe
    return btoa(combined)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Generate the share link when the dialog opens
  useEffect(() => {
    if (isOpen && url) {
      generateShareLink();
    }
    return () => {
      // Reset state when dialog closes
      if (!isOpen) {
        setShareUrl("");
      }
    };
  }, [isOpen, url, year]);

  // Focus the input when the share URL is available
  useEffect(() => {
    if (shareUrl && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      inputRef.current.scrollLeft = 0;
    }
  }, [shareUrl]);

  const generateShareLink = async () => {
    setIsLoading(true);
    try {
      // Client-side encoding
      const code = encodeData(url, year);
      
      // Construct the URL using the current window location
      const baseUrl = window.location.origin;
      // Remove /share/ from the path
      const formattedUrl = `${baseUrl}/internet-explorer/${code}`;

      setShareUrl(formattedUrl);
    } catch (error) {
      console.error("Error generating share link:", error);
      toast.error("Failed to generate share link", {
        description: "Please try again later",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (inputRef.current && shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied", {
          description: "Share link copied to clipboard",
        });
        onClose(); // Dismiss the dialog after copying
      } catch (err) {
        console.error("Failed to copy text: ", err);
        toast.error("Failed to copy link", {
          description:
            "Could not copy to clipboard. Please try manually selecting and copying.",
        });
        // Fallback for older browsers or if permission denied, select the text
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  };

  const getQRCodeUrl = () => {
    if (!shareUrl) return "";
    const encodedUrl = encodeURIComponent(shareUrl);
    return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodedUrl}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="bg-system7-window-bg border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] max-w-xs"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="font-normal text-[16px]">Share Page</DialogTitle>
          <DialogDescription className="sr-only">Share this page via link or QR code</DialogDescription>
        </DialogHeader>
        <div className="p-3 w-full">
          <div className="flex flex-col items-center space-y-3 w-full">
            {/* QR Code */}
            {isLoading ? (
              <div className="w-32 h-32 flex items-center justify-center bg-gray-100 rounded">
                <p className="text-gray-500 text-[10px] font-geneva-12">Generating...</p>
              </div>
            ) : shareUrl ? (
              <div className="bg-white p-1.5 w-32 h-32 flex items-center justify-center">
                <img 
                  src={getQRCodeUrl()} 
                  alt={`QR Code for ${shareUrl}`} 
                  className="w-28 h-28"
                  title={`Scan to open: ${shareUrl}`}
                />
              </div>
            ) : (
              <div className="w-32 h-32 flex items-center justify-center bg-gray-100 rounded">
                <p className="text-gray-500 text-[10px] font-geneva-12">QR code</p>
              </div>
            )}
            {/* Add descriptive text below QR code */}
            {/* Always show the original URL and year */}
            <p className="text-xs text-neutral-500 text-center mt-0 mb-4 break-words font-geneva-12 w-[80%]">
              Share link or scan to view {url} in year {year}
            </p>
            
            {/* URL Input */}
            <Input
              ref={inputRef}
              value={shareUrl}
              readOnly
              className="shadow-none h-8 text-sm w-full"
              placeholder={isLoading ? "Generating..." : "Share link"}
            />
          </div>
          
          <DialogFooter className="mt-2 flex justify-end gap-1">
            {/* <Button 
              onClick={onClose} 
              variant="retro"
            >
              Cancel
            </Button> */}
            <Button 
              onClick={handleCopyToClipboard} 
              disabled={!shareUrl || isLoading}
              variant="retro"
              className="w-full"
            >
              Copy Link
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}