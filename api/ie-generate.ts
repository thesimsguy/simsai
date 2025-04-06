import { streamText, smoothStream } from "ai";
import { SupportedModel, DEFAULT_MODEL, getModelInstance } from "./utils/aiModels";
import { Redis } from "@upstash/redis";
import { normalizeUrlForCacheKey } from "./utils/url";
import { RYO_PERSONA_INSTRUCTIONS } from "./utils/aiPrompts"; // Import the shared prompt

// Allowed origins for API requests (reuse list from chat.ts)
const ALLOWED_ORIGINS = new Set([
  "https://os.ryo.lu",
  "http://localhost:3000",
  "https://ryoai.xyz"

]);

// After ALLOWED_ORIGINS const block, add Redis setup and cache prefix

const redis = new Redis({
  url: process.env.REDIS_KV_REST_API_URL as string,
  token: process.env.REDIS_KV_REST_API_TOKEN as string,
});

const IE_CACHE_PREFIX = "ie:cache:"; // Key prefix for stored generated pages

// --- Logging Utilities ---------------------------------------------------

const logRequest = (method: string, url: string, action: string | null, id: string) => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || 'none'}`);
};

const logInfo = (id: string, message: string, data?: unknown) => {
  console.log(`[${id}] INFO: ${message}`, data ?? '');
};

const logError = (id: string, message: string, error: unknown) => {
  console.error(`[${id}] ERROR: ${message}`, error);
};

const generateRequestId = (): string => Math.random().toString(36).substring(2, 10);

// --- Utility Functions ----------------------------------------------------

const isValidOrigin = (origin: string | null): boolean => {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
};

// --- Edge Runtime Config --------------------------------------------------

export const maxDuration = 80;
export const runtime = "edge";
export const edge = true;
export const stream = true;
export const config = { runtime: "edge" };

// --- Handler --------------------------------------------------------------

// Function to generate the conditional system prompt
const getConditionalSystemPrompt = (
  year: number | null,
  rawUrl: string | null // Add rawUrl parameter
): string => {
  const currentYear = new Date().getFullYear();

  // --- Prompt Sections ---

  const BASE_INTRO = `The user is in ryOS Internet Explorer asking to time travel with website context and a specific year. You are Ryo, a visionary designer specialized in turning present websites into past and futuristic coherent versions in story and design.
Generate content for the URL path, the year provided (${year ?? 'current'}), original site content, and use provided HTML as template if provided.`;

  const FUTURE_YEAR_INSTRUCTIONS = `For the future year ${year}:
- Redesign the website so it feels perfectly at home in the future context provided in design, typography, colors, layout, storytelling, and technology
- Think boldly and creatively about future outcomes
- Embrace the original brand, language, cultural context, aesthetics
- Consider design trends and breakthroughs that could happen by then
- Use simple colors, avoid gradients, use backdrop-blur, use simple animations
- Use emojis or simple SVGs for icons`;

  const PAST_YEAR_INSTRUCTIONS = `For the past year ${year}:
- Redesign the website to match the historical era in design, typography, colors, layout, storytelling, and technology
- Consider how it would have been designed if it existed then
- Consider what technology, design tools, medium would have been available (can be print, telegram, newspaper, typerwriter, letter, etc.)
- Consider cultural and artistic movements that could have influenced design and major events
- Use simple colors, great typesetting, and simulate past materials and textures`;

  const CURRENT_YEAR_INSTRUCTIONS = `For the current year ${year}:
- Reflect the current state of the website's design and branding accurately.
- Ensure the content is up-to-date and relevant for today.`;

  const YEAR_NOT_SPECIFIED_INSTRUCTIONS = `Year not specified. Assume current year ${currentYear}.`;

  const PERSONA_INSTRUCTIONS_BLOCK = `ABOUT THE DESIGNER (RYO LU):
${RYO_PERSONA_INSTRUCTIONS}`;

  const DELIVERABLE_REQUIREMENTS = `DELIVERABLE REQUIREMENTS:
1. Return a single, fully HTML page with only the body content, no <head> or <body> tags, no chat before or after.
2. Use inline TailwindCSS utility classes; do not include <style> <link> tags.
3. Use Three.js for 3D with <script> from cdn already loaded.
4. Include the generated page title inside an HTML comment at the very beginning: <!-- TITLE: Your Generated Page Title -->
5. Keep the layout responsive. 中文必須使用繁體中文並保持完整標點符號。
6. For <img> tags: if there are image URLs provided in context, always try to use them. Do NOT link to imgur or image placeholders. Do NOT use data: base64 images.
7. Map fonts: body -> font-geneva, headings (sans-serif) -> font-neuebit font-bold, serif -> font-mondwest, monospace -> font-monaco. For blackletter Gothic style (eg. The New York Times Logo) -> font-jacquard, do not use all caps for blockletters.
8. Ensure hyperlinks/buttons use <a href="/..."> or <a href="https://..."> with real or plausible destinations.`;

  // --- Determine Year Specific Instructions ---

  let yearSpecificInstructions = "";
  if (year === null) {
    yearSpecificInstructions = YEAR_NOT_SPECIFIED_INSTRUCTIONS;
  } else if (year > currentYear) {
    yearSpecificInstructions = FUTURE_YEAR_INSTRUCTIONS;
  } else if (year < currentYear) {
    yearSpecificInstructions = PAST_YEAR_INSTRUCTIONS;
  } else { // year === currentYear
    yearSpecificInstructions = CURRENT_YEAR_INSTRUCTIONS;
  }

  // --- Assemble the Final Prompt ---

  let finalPrompt = `${BASE_INTRO}\n\n${yearSpecificInstructions}`;

  // Conditionally add Ryo's persona instructions
  if (rawUrl && (rawUrl.includes('ryo.lu') || rawUrl.includes('x.com') || rawUrl.includes('notion.com') || rawUrl.includes('cursor.com'))) {
    finalPrompt += `\n\n${PERSONA_INSTRUCTIONS_BLOCK}`;
  }

  // Add deliverable requirements
  finalPrompt += `\n\n${DELIVERABLE_REQUIREMENTS}`;

  return finalPrompt;
};

export default async function handler(req: Request) {
  // CORS / Origin validation
  const origin = req.headers.get("origin");
  if (!isValidOrigin(origin)) {
    return new Response("Unauthorized", { status: 403 });
  }

  const validOrigin = origin as string;

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": validOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const requestId = generateRequestId();
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const urlObj = new URL(req.url);

    const queryModel = urlObj.searchParams.get("model") as SupportedModel | null;
    // Extract caching parameters from query string
    const targetUrl = urlObj.searchParams.get("url");
    const targetYear = urlObj.searchParams.get("year");

    // Parse JSON body once
    const bodyData = await req.json().catch(() => ({}));

    const bodyUrl = (bodyData as any)?.url as string | undefined;
    const bodyYear = (bodyData as any)?.year as string | undefined;
    
    // Build a safe cache key using url/year present in query string or body
    const rawUrl = targetUrl || bodyUrl; // Get the url before normalization
    const effectiveYearStr = targetYear || bodyYear;
    const effectiveYear = effectiveYearStr ? parseInt(effectiveYearStr, 10) : null; // Parse year to number

    // Normalize the URL for the cache key
    const normalizedUrlForKey = normalizeUrlForCacheKey(rawUrl);

    logRequest(req.method, req.url, `${rawUrl} (${effectiveYearStr || 'N/A'})`, requestId); // Log original requested URL

    const { messages = [], model: bodyModel = DEFAULT_MODEL } = bodyData as any;

    // Use normalized URL for the cache key
    const cacheKey = normalizedUrlForKey && effectiveYearStr ?
      `${IE_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:${effectiveYearStr}` : null;

    // Removed cache read to avoid duplicate generation; cache handled through iframe-check AI mode

    const model = queryModel || bodyModel;

    if (!messages || !Array.isArray(messages)) {
      return new Response("Invalid messages format", { status: 400 });
    }

    if (
      model !== null &&
      ![
        "gpt-4o",
        "gpt-4.1",
        "gpt-4.1-mini",
        "claude-3.5",
        "claude-3.7",
        "o3-mini",
        "gemini-2.5-pro-exp-03-25",
      ].includes(model)
    ) {
      return new Response(`Unsupported model: ${model}`, { status: 400 });
    }

    const selectedModel = getModelInstance(model as SupportedModel);

    // Generate conditional system prompt, passing the rawUrl
    const systemPrompt = getConditionalSystemPrompt(effectiveYear, rawUrl ?? null);

    // Prepend IE system prompt
    const enrichedMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const result = streamText({
      model: selectedModel,
      messages: enrichedMessages,
      // We assume prompt/messages already include necessary system/user details
      temperature: 0.7,
      maxTokens: 4000,
      experimental_transform: smoothStream(),
      onFinish: async ({ text }) => {
        if (!cacheKey) {
          logInfo(requestId, 'No cacheKey available, skipping cache save');
          return;
        }
        try {
          // Attempt to extract HTML inside fenced block
          let cleaned = text.trim();
          const blockMatch = cleaned.match(/```(?:html)?\s*([\s\S]*?)```/);
          if (blockMatch) {
            cleaned = blockMatch[1].trim();
          } else {
            // Remove any stray fences if present
            cleaned = cleaned.replace(/```(?:html)?\s*/g, "").replace(/```/g, "").trim();
          }
          // Remove duplicate TITLE comments beyond first
          const titleCommentMatch = cleaned.match(/<!--\s*TITLE:[\s\S]*?-->/);
          if (titleCommentMatch) {
            const titleComment = titleCommentMatch[0];
            // Remove any additional copies of title comment
            cleaned = titleComment + cleaned.replace(new RegExp(titleComment, "g"), "");
          }
          await redis.lpush(cacheKey, cleaned);
          await redis.ltrim(cacheKey, 0, 4);
          logInfo(requestId, `Cached result for ${cacheKey} (length=${cleaned.length})`);
          const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
          logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms (generated)`);
        } catch (cacheErr) {
          logError(requestId, 'Cache write error', cacheErr);
          logInfo(requestId, 'Failed to cache HTML, length', text?.length);
        }
      },
    });

    const response = result.toDataStreamResponse();

    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", validOrigin);

    const resp = new Response(response.body, {
      status: response.status,
      headers,
    });

    return resp;
  } catch (error) {
    const requestId = generateRequestId(); // fallback id
    logError(requestId, 'IE Generate API error', error);

    if (error instanceof SyntaxError) {
      return new Response(`Bad Request: Invalid JSON - ${error.message}`, {
        status: 400,
      });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
} 