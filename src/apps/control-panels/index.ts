import { BaseApp } from "../base/types";
import { ControlPanelsAppComponent } from "./components/ControlPanelsAppComponent";

export const helpItems = [
  {
    icon: "🎨",
    title: "Appearance",
    description:
      "Choose photos, patterns, or shader effects for your desktop wallpaper",
  },
  {
    icon: "🔊",
    title: "Sounds",
    description:
      "Toggle UI sounds, typing synth, and Terminal / IE effects",
  },
  {
    icon: "🤖",
    title: "AI Model",
    description:
      "Select the AI model used by Chats and Terminal assistant",
  },
  {
    icon: "🌌",
    title: "Shader Effects",
    description:
      "Enable CRT, Galaxy, or Aurora visual effects",
  },
  {
    icon: "📦",
    title: "Backup & Restore",
    description:
      "Export or restore all settings and files",
  },
  {
    icon: "⚙️",
    title: "System",
    description:
      "Reset preferences or format the virtual file system",
  },
];

export const appMetadata = {
  name: "Control Panels",
  version: "1.0.0",
  creator: {
    name: "System",
    url: "https://github.com/ryokun6",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/control-panels/appearance-manager/app.png",
};

const app: BaseApp = {
  id: "control-panels",
  name: "Control Panels",
  icon: {
    type: "image",
    src: "/icons/control-panels/appearance-manager/app.png",
  },
  description: "System settings and configuration",
  component: ControlPanelsAppComponent,
  helpItems,
  metadata: appMetadata,
};

export default app;
