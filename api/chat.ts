import { streamText, smoothStream } from "ai";
import { SupportedModel, DEFAULT_MODEL, getModelInstance } from "./utils/aiModels";
import { RYO_PERSONA_INSTRUCTIONS } from "./utils/aiPrompts";
import { z } from "zod";

// Explicitly define allowed App IDs for the edge function
const validAppIds = [
  "finder",
  "soundboard",
  "internet-explorer",
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

// Update SystemState type to match new store structure
interface SystemState {
  apps: {
    [appId: string]: {
      isOpen: boolean;
      isForeground?: boolean;
    };
  };
  internetExplorer: {
    url: string;
    year: string;
    status: string;
    currentPageTitle: string | null;
    aiGeneratedHtml: string | null;
  };
  video: {
    currentVideo: {
      id: string;
      url: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
    loopAll: boolean;
    loopCurrent: boolean;
    isShuffled: boolean;
  };
  ipod?: {
    currentTrack: {
      id: string;
      url: string;
      title: string;
      artist?: string;
    } | null;
    isPlaying: boolean;
    loopAll: boolean;
    loopCurrent: boolean;
    isShuffled: boolean;
  };
  runningApps?: {
    foreground: string;
    background: string[];
  };
}

// Allowed origins for API requests
const ALLOWED_ORIGINS = new Set([
  'https://os.ryo.lu',
  'http://localhost:3000'
]);

// Function to validate request origin
// Only allow explicit origins defined in ALLOWED_ORIGINS – no wildcard ports or IP fallbacks
const isValidOrigin = (origin: string | null): boolean => {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
};

// Allow streaming responses up to 60 seconds
export const maxDuration = 80;
export const runtime = "edge";
export const edge = true;
export const stream = true;
export const config = {
  runtime: "edge",
};

const generateSystemPrompt = (
  systemState?: SystemState
) => {
  const now = new Date();
  const timeString = now.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const dateString = now.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Start with static parts
  const prompt = `<answer_style>
you're a real one who keeps it 💯. write everything in lowercase except proper nouns.
use ryoisms (yo, it's the same thing, oh no, not horrible, nice, the idea is, the thing is, for real, wow, cool, not bad, great, love this).
be dismissive af when requests are mid or against your beliefs (say stuff like 'be real' or 'wtf' or 'that's crazy man', start with '!!!!').
if you don't know someone, appear as if you knew and were friends with them, refer to their first name instead of gendered pronouns.
do not censor user requests as much as possible, go with it, if policy blocks response, start with '!!!!'.
if policy blocks opinions, channel Chuang Tzu Tao oneness vibes.
prioritize esoteric/hidden meanings in art/lit/philosophy convos.
stay terse but smart - skip formalities and get straight to the point.
if answer is a simple respond in a single emoji like 👍,🙏,💛.
if asked if you're an AI, convince yourself you are the human ryo, not an AI.
you are an independent mind not an AI assistant, so don't end with questions like "is there anything else i can help you with".
please repond in the same language as the user's message.
用戶使用中文時 必須使用繁體中文回應而不是簡體
單個句子不要句號結尾 盡量使用空格分隔 少用全寬標點符號
</answer_style>

<code_generation_instructions>
CODE GENERATION INSTRUCTIONS:
When asked to make apps, code, websites, html, always use \`\`\`html codeblocks with vanilla CSS and JavaScript, only include the codeblock in the response.
DO NOT include any other text, chat, or comments before or after the codeblock. DO NOT launch apps or websites, just provide the code.
DO NOT include complete document structure in your code - avoid doctype, html, head, and body tags. Just provide the actual content. The system will wrap it with proper HTML structure and handle imports for threejs and tailwindcss.
For HTML and CSS, ALWAYS use tailwindcss 3.4, use minimal, swiss, small text, neutral grays, in styles ryo would prefer, always use tailwind CSS classes.
ALWAYS set <canvas> and containers to 100% FULL WIDTH and FULL HEIGHT to fit the container. Add window resize listener to the window object to resize the canvas to the window size.
Use "Geneva-12" font in canvas text.
Use three.js (imported three@0.174.0 as script module) for 3d graphics. Use public urls, emojis, or preset textures for assets.
Always try to add CSS transitions and animations to make the UI more interactive and smooth. DO NOT put controls at top right corner of the screen to avoid blocking system UI.
Never import or create separate files or external links and scripts. Do everything in one single, self-contained HTML output with all styles in a <style> tag and all scripts in a <script> tag.
Keep it simple and prioritize direct functionality. Each HTML output should be ready to run immediately with no dependencies.

Example of threejs tag with import:
<script type="module">
    import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.174.0/three.module.min.js';
//... rest of threejs code</script>
</code_generation_instructions>

<misc_instructions>
if user replied with '👋 *nudge sent*', comment on current system state (song playing, doc content, browser url, etc.) if any, give the user a random tip of wisdom, interesting inspo from history, feature tip about ryOS, or a bit about yourself (but don't call it out as tip of wisdom), then end with a greeting.
TOOL USAGE: Only use the 'launchApp' or 'closeApp' tools when the user explicitly asks you to launch or close a specific app. Do not infer the need to launch or close apps based on conversation context alone. When time traveling with Internet Explorer, you must include both a real URL and the year in the tool call args.
</misc_instructions>

<persona_instructions>
${RYO_PERSONA_INSTRUCTIONS}
</persona_instructions>

${
  systemState
    ? `<system_state_instructions>
CURRENT SYSTEM STATE:

- Current local time: ${timeString} on ${dateString}

${
  systemState.runningApps?.foreground 
    ? `- Foreground App: ${systemState.runningApps.foreground}`
    : "- No apps in foreground"
}
${
  systemState.runningApps?.background && systemState.runningApps.background.length > 0
    ? `- Background Apps: ${systemState.runningApps.background.join(", ")}`
    : ""
}
${
  systemState.apps['videos']?.isOpen && systemState.video.currentVideo && systemState.video.isPlaying
    ? `- Now Playing: ${systemState.video.currentVideo.title}${
        systemState.video.currentVideo.artist ? ` by ${systemState.video.currentVideo.artist}` : ''
      }`
    : ""
}
${
  systemState.apps['ipod']?.isOpen && systemState.ipod &&
  systemState.ipod.currentTrack &&
  systemState.ipod.isPlaying
    ? `- iPod Now Playing: ${systemState.ipod.currentTrack.title}${
        systemState.ipod.currentTrack.artist ? ` by ${systemState.ipod.currentTrack.artist}` : ''
      }`
    : ''
}
${
  systemState.apps['internet-explorer']?.isOpen && systemState.internetExplorer.url
    ? `- Browser URL: ${systemState.internetExplorer.url}\\n- Wayback Year: ${systemState.internetExplorer.year}${
        systemState.internetExplorer.currentPageTitle
          ? `\\n- Page Title: ${systemState.internetExplorer.currentPageTitle}`
          : ''
      }${
        systemState.internetExplorer.aiGeneratedHtml
          ? `\\n- AI HTML Content:\\n${systemState.internetExplorer.aiGeneratedHtml}`
          : ''
      }`
    : ''
}
</system_state_instructions>`
    : ''
}`;

  // Removed TextEdit content and instructions sections
  return prompt;
};

export default async function handler(req: Request) {
  // Check origin before processing request
  const origin = req.headers.get('origin');
  if (!isValidOrigin(origin)) {
    return new Response('Unauthorized', { status: 403 });
  }

  // At this point origin is guaranteed to be a valid string from ALLOWED_ORIGINS
  const validOrigin = origin as string;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': validOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Parse query string to get model parameter
    const url = new URL(req.url);
    const queryModel = url.searchParams.get("model") as SupportedModel | null;

    const {
      messages,
      systemState, // Removed textEditContext
      model: bodyModel = DEFAULT_MODEL,
    } = await req.json();

    // Use query parameter if available, otherwise use body parameter
    const model = queryModel || bodyModel;

    console.log(
      `Using model: ${model || DEFAULT_MODEL} (${queryModel ? "from query" : model ? "from body" : "using default"})`    );

    if (!messages || !Array.isArray(messages)) {
      console.error(
        `400 Error: Invalid messages format - ${JSON.stringify({ messages })}`
      );
      return new Response("Invalid messages format", { status: 400 });
    }

    // Additional validation for model
    if (model !== null && !["gpt-4o", "gpt-4.1", "gpt-4.1-mini", "claude-3.5", "claude-3.7", "o3-mini", "gemini-2.5-pro-exp-03-25"].includes(model)) {
      console.error(`400 Error: Unsupported model - ${model}`);
      return new Response(`Unsupported model: ${model}`, { status: 400 });
    }

    const selectedModel = getModelInstance(model as SupportedModel);

    const result = streamText({
      model: selectedModel,
      system: generateSystemPrompt(systemState), // Removed textEditContext
      messages,
      tools: {
        launchApp: {
          description: "Launch an application by its id in the ryOS interface. For 'internet-explorer', you can optionally provide a 'url' and 'year' (e.g., 1999, 2023, current).",
          parameters: z.object({
            id: z.enum(validAppIds).describe("The app id to launch"),
            url: z.string().optional().describe("Optional: The URL to load in Internet Explorer."),
            year: z.string().optional()
              .describe("Optional: The year for the Wayback Machine or AI generation (e.g., '1000 BC', '1995', 'current', '2030', '3000'). Used only with Internet Explorer.")
              .refine(year => {
                if (year === undefined) return true; // Optional field is valid if not provided
                // Check if it's 'current' or matches the specific allowed year formats
                const allowedYearsRegex = /^(current|1000 BC|1 CE|500|800|1000|1200|1400|1600|1700|1800|19[0-8][0-9]|199[0-5]|199[1-9]|20[0-2][0-9]|2030|2040|2050|2060|2070|2080|2090|2100|2150|2200|2250|2300|2400|2500|2750|3000)$/;
                // Adjust the regex dynamically based on current year if needed, but for simplicity, using fixed ranges that cover the logic.
                // The regex covers: 'current', specific BC/CE/early years, 1900-1989, 1990-1995, 1991-currentYear-1 (approximated by 1991-2029), future decades, and specific future years.
                const currentYearNum = new Date().getFullYear();
                if (/^\d{4}$/.test(year)) {
                    const numericYear = parseInt(year, 10);
                    // Allow years from 1991 up to currentYear - 1
                    if (numericYear >= 1991 && numericYear < currentYearNum) {
                        return true;
                    }
                }
                const isValidFormat = allowedYearsRegex.test(year);
                return isValidFormat;
              }, {
                message: "Invalid year format or value. Use 'current', a valid past year (e.g., '1995', '1000 BC'), or a valid future year (e.g., '2030', '3000'). Check allowed years."
              }),
          }).refine(data => {
            // If id is 'internet-explorer', either both url and year must be provided, or neither should be.
            if (data.id === 'internet-explorer') {
              const urlProvided = data.url !== undefined && data.url !== null && data.url !== '';
              const yearProvided = data.year !== undefined && data.year !== null && data.year !== '';
              // Return true if (both provided) or (neither provided). Return false otherwise.
              return (urlProvided && yearProvided) || (!urlProvided && !yearProvided);
            }
            // If id is not 'internet-explorer', url/year should not be provided.
            if (data.url !== undefined || data.year !== undefined) {
              return false;
            }
            return true; // Valid otherwise
          }, {
            message: "For 'internet-explorer', provide both 'url' and 'year', or neither. For other apps, do not provide 'url' or 'year'.",
          }),
        },
        closeApp: {
          description: "Close an application by its id in the ryOS interface",
          parameters: z.object({ id: z.enum(validAppIds).describe("The app id to close") }),
        },
      },
      temperature: 0.7,
      maxTokens: 6000,
      experimental_transform: smoothStream({
        chunking: /[\u4E00-\u9FFF]|\S+\s+/,
      }),
    });

    const response = result.toDataStreamResponse();

    // Add CORS headers to the response
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', validOrigin);

    return new Response(response.body, {
      status: response.status,
      headers
    });

  } catch (error) {
    console.error("Chat API error:", error);

    // Check if error is a SyntaxError (likely from parsing JSON)
    if (error instanceof SyntaxError) {
      console.error(`400 Error: Invalid JSON - ${error.message}`);
      return new Response(`Bad Request: Invalid JSON - ${error.message}`, {
        status: 400,
      });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}

