import { useAppStore } from "@/stores/useAppStore";
import { AppId } from "@/config/appRegistry";

// Export the interface
export interface LaunchAppOptions {
  initialPath?: string;
  initialData?: any; // Add initialData field
}

export const useLaunchApp = () => {
  // Get the correct action from the store
  const launchOrFocus = useAppStore((state) => state.launchOrFocusApp);

  const launchApp = (appId: AppId, options?: LaunchAppOptions) => {
    console.log(`[AppManager] Launch event received for ${appId}`, options);

    // Special handling for Finder initial path
    if (appId === "finder" && options?.initialPath) {
      localStorage.setItem("app_finder_initialPath", options.initialPath);
    }

    // Use the new action, passing initialData if provided
    launchOrFocus(appId, options?.initialData);
  };

  return launchApp;
};
