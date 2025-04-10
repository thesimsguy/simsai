import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppId } from "@/config/appRegistry";
import { AppManagerState, AppState } from "@/apps/base/types";
import { checkShaderPerformance } from "@/utils/performanceCheck";
import { ShaderType } from "@/components/shared/GalaxyBackground";

// Define available AI models (matching API options from chat.ts)
export type AIModel =
  | "gpt-4o"
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | "claude-3.5"
  | "claude-3.7"
  | "o3-mini"
  | "gemini-2.5-pro-exp-03-25"
  | null;

// Define known app IDs directly here to avoid circular dependency
const APP_IDS = [
  "finder",
  "soundboard",
  "internet-explorer",
  "github",
  "twitter",
  "chats",
  "textedit",
  "paint",
  "photo-booth",
  "minesweeper",
  "videos",
  "ipod",
  "synth",
  "pc",
  "terminal",
  "control-panels",
] as const;

const getInitialState = (): AppManagerState => ({
  windowOrder: [],
  apps: APP_IDS.reduce(
    (acc, appId) => ({
      ...acc,
      [appId]: { isOpen: false },
    }),
    {} as { [appId: string]: AppState }
  ),
});

interface AppStoreState extends AppManagerState {
  debugMode: boolean;
  setDebugMode: (enabled: boolean) => void;
  shaderEffectEnabled: boolean;
  setShaderEffectEnabled: (enabled: boolean) => void;
  selectedShaderType: ShaderType;
  setSelectedShaderType: (shaderType: ShaderType) => void;
  aiModel: AIModel;
  setAiModel: (model: AIModel) => void;
  terminalSoundsEnabled: boolean;
  setTerminalSoundsEnabled: (enabled: boolean) => void;
  bringToForeground: (appId: AppId | "") => void;
  toggleApp: (appId: AppId, initialData?: any) => void;
  closeApp: (appId: AppId) => void;
  navigateToNextApp: (currentAppId: AppId) => void;
  navigateToPreviousApp: (currentAppId: AppId) => void;
  clearInitialData: (appId: AppId) => void;
  launchOrFocusApp: (appId: AppId, initialData?: any) => void;
}

// Run the check once on script load
const initialShaderState = checkShaderPerformance();

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      ...getInitialState(),
      debugMode: false,
      setDebugMode: (enabled) => set({ debugMode: enabled }),
      shaderEffectEnabled: initialShaderState,
      setShaderEffectEnabled: (enabled) =>
        set({ shaderEffectEnabled: enabled }),
      selectedShaderType: ShaderType.AURORA,
      setSelectedShaderType: (shaderType) =>
        set({ selectedShaderType: shaderType }),
      aiModel: null, // Default model set to null for client-side
      setAiModel: (model) => set({ aiModel: model }),
      terminalSoundsEnabled: true, // Default to true for terminal/IE sounds
      setTerminalSoundsEnabled: (enabled) =>
        set({ terminalSoundsEnabled: enabled }),

      bringToForeground: (appId) => {
        set((state) => {
          const newState: AppManagerState = {
            windowOrder: [...state.windowOrder],
            apps: { ...state.apps },
          };

          // If empty string provided, just clear foreground flags
          if (!appId) {
            Object.keys(newState.apps).forEach((id) => {
              newState.apps[id] = { ...newState.apps[id], isForeground: false };
            });
          } else {
            // Re‑order windowOrder so that appId is last (top‑most)
            newState.windowOrder = [
              ...newState.windowOrder.filter((id) => id !== appId),
              appId,
            ];

            // Set foreground flags
            Object.keys(newState.apps).forEach((id) => {
              newState.apps[id] = {
                ...newState.apps[id],
                isForeground: id === appId,
              };
            });
          }

          // Emit DOM event (keep behaviour parity)
          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: newState.apps[appId]?.isOpen || false,
              isForeground: true,
            },
          });
          window.dispatchEvent(appStateChangeEvent);

          return newState;
        });
      },

      toggleApp: (appId, initialData) => {
        set((state) => {
          const isCurrentlyOpen = state.apps[appId]?.isOpen;
          let newWindowOrder = [...state.windowOrder];

          if (isCurrentlyOpen) {
            // Remove the app from window order
            newWindowOrder = newWindowOrder.filter((id) => id !== appId);
          } else {
            // Add the app to window order
            newWindowOrder = [...newWindowOrder, appId];
          }

          const newApps: { [appId: string]: AppState } = { ...state.apps };

          // If closing the app and there are other open apps, bring the most recent one to foreground
          const shouldBringPreviousToForeground =
            isCurrentlyOpen && newWindowOrder.length > 0;
          const previousAppId = shouldBringPreviousToForeground
            ? newWindowOrder[newWindowOrder.length - 1]
            : null;

          Object.keys(newApps).forEach((id) => {
            if (id === appId) {
              newApps[id] = {
                ...newApps[id],
                isOpen: !isCurrentlyOpen,
                isForeground: !isCurrentlyOpen,
                initialData: !isCurrentlyOpen ? initialData : undefined,
              };
            } else {
              newApps[id] = {
                ...newApps[id],
                isForeground:
                  shouldBringPreviousToForeground && id === previousAppId,
              };
            }
          });

          const newState: AppManagerState = {
            windowOrder: newWindowOrder,
            apps: newApps,
          };

          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: !isCurrentlyOpen,
              isForeground: !isCurrentlyOpen,
            },
          });
          window.dispatchEvent(appStateChangeEvent);

          return newState;
        });
      },

      closeApp: (appId) => {
        set((state) => {
          if (!state.apps[appId]?.isOpen) {
            console.log(`App ${appId} is already closed. No action taken.`);
            return state; // App is already closed, do nothing
          }

          console.log(`Closing app: ${appId}`);

          const newWindowOrder = state.windowOrder.filter((id) => id !== appId);
          const newApps: { [id: string]: AppState } = { ...state.apps };

          // Determine the next app to bring to foreground
          const nextForegroundAppId =
            newWindowOrder.length > 0
              ? newWindowOrder[newWindowOrder.length - 1]
              : null;

          Object.keys(newApps).forEach((id) => {
            if (id === appId) {
              newApps[id] = {
                ...newApps[id],
                isOpen: false,
                isForeground: false,
                initialData: undefined, // Clear initial data on close
              };
            } else {
              newApps[id] = {
                ...newApps[id],
                // Bring the next app in order to foreground if this wasn't the last app closed
                isForeground: id === nextForegroundAppId,
              };
            }
          });

          const newState: AppManagerState = {
            windowOrder: newWindowOrder,
            apps: newApps,
          };

          // Emit DOM event for closing
          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: false,
              isForeground: false,
            },
          });
          window.dispatchEvent(appStateChangeEvent);
          console.log(`App ${appId} closed. New window order:`, newWindowOrder);
          console.log(
            `App ${nextForegroundAppId || "none"} brought to foreground.`
          );

          return newState;
        });
      },

      launchOrFocusApp: (appId, initialData) => {
        set((state) => {
          const isCurrentlyOpen = state.apps[appId]?.isOpen;
          let newWindowOrder = [...state.windowOrder];
          const newApps: { [id: string]: AppState } = { ...state.apps };

          console.log(
            `[AppStore:launchOrFocusApp] App: ${appId}, Currently Open: ${isCurrentlyOpen}, InitialData:`,
            initialData
          );

          if (isCurrentlyOpen) {
            // App is open: Bring to front, update initialData
            newWindowOrder = newWindowOrder.filter((id) => id !== appId);
            newWindowOrder.push(appId);
          } else {
            // App is closed: Add to end
            newWindowOrder.push(appId);
          }

          // Update all apps for foreground status and the target app's data/open state
          Object.keys(newApps).forEach((id) => {
            const isTargetApp = id === appId;
            newApps[id] = {
              ...newApps[id],
              isOpen: isTargetApp ? true : newApps[id].isOpen, // Ensure target is open
              isForeground: isTargetApp, // Target is foreground
              // Update initialData ONLY for the target app
              initialData: isTargetApp ? initialData : newApps[id].initialData,
            };
          });

          const newState: AppManagerState = {
            windowOrder: newWindowOrder,
            apps: newApps,
          };

          // Emit event (optional, but good for consistency)
          const appStateChangeEvent = new CustomEvent("appStateChange", {
            detail: {
              appId,
              isOpen: true,
              isForeground: true,
              updatedData: !!initialData, // Indicate if data was updated
            },
          });
          window.dispatchEvent(appStateChangeEvent);

          return newState;
        });
      },

      navigateToNextApp: (currentAppId) => {
        const { windowOrder } = get();
        if (windowOrder.length <= 1) return;
        const currentIndex = windowOrder.indexOf(currentAppId);
        if (currentIndex === -1) return;
        const nextAppId = windowOrder[
          (currentIndex + 1) % windowOrder.length
        ] as AppId;
        get().bringToForeground(nextAppId);
      },

      navigateToPreviousApp: (currentAppId) => {
        const { windowOrder } = get();
        if (windowOrder.length <= 1) return;
        const currentIndex = windowOrder.indexOf(currentAppId);
        if (currentIndex === -1) return;
        const prevIndex =
          (currentIndex - 1 + windowOrder.length) % windowOrder.length;
        const prevAppId = windowOrder[prevIndex] as AppId;
        get().bringToForeground(prevAppId);
      },

      clearInitialData: (appId) => {
        set((state) => {
          if (state.apps[appId]?.initialData) {
            console.log(`[AppStore] Clearing initialData for ${appId}`);
            return {
              apps: {
                ...state.apps,
                [appId]: {
                  ...state.apps[appId],
                  initialData: undefined,
                },
              },
            };
          }
          return state; // No change needed
        });
      },
    }),
    {
      name: "ryos:app-store",
      partialize: (state) => ({
        windowOrder: state.windowOrder,
        apps: state.apps,
        debugMode: state.debugMode,
        shaderEffectEnabled: state.shaderEffectEnabled,
        selectedShaderType: state.selectedShaderType,
        aiModel: state.aiModel,
        terminalSoundsEnabled: state.terminalSoundsEnabled,
      }),
    }
  )
);
