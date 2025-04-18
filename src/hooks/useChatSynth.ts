import { useEffect, useRef, useState, useCallback } from "react";
import * as Tone from "tone";
import { loadSynthPreset } from "@/utils/storage";
import { useVibration } from './useVibration';

export type SynthPreset = {
  name: string;
  oscillator: {
    type: OscillatorType;
  };
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  effects: {
    filter: {
      frequency: number;
      rolloff: -12 | -24 | -48 | -96;
    };
    tremolo: {
      frequency: number;
      depth: number;
    };
    reverb: {
      decay: number;
      wet: number;
    };
  };
};

// Define valid oscillator types
type OscillatorType = "triangle" | "sine" | "square" | "sawtooth";

export const SYNTH_PRESETS: Record<string, SynthPreset> = {
  classic: {
    name: "Classic",
    oscillator: {
      type: "triangle",
    },
    envelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.2,
      release: 0.3,
    },
    effects: {
      filter: {
        frequency: 2000,
        rolloff: -12,
      },
      tremolo: {
        frequency: 0.8,
        depth: 0.3,
      },
      reverb: {
        decay: 1.5,
        wet: 0.7,
      },
    },
  },
  ethereal: {
    name: "Ethereal",
    oscillator: {
      type: "sine",
    },
    envelope: {
      attack: 0.1,
      decay: 0.4,
      sustain: 0.4,
      release: 0.8,
    },
    effects: {
      filter: {
        frequency: 3000,
        rolloff: -24,
      },
      tremolo: {
        frequency: 0.5,
        depth: 0.5,
      },
      reverb: {
        decay: 2.5,
        wet: 0.8,
      },
    },
  },
  digital: {
    name: "Digital",
    oscillator: {
      type: "square",
    },
    envelope: {
      attack: 0.005,
      decay: 0.1,
      sustain: 0.1,
      release: 0.1,
    },
    effects: {
      filter: {
        frequency: 4000,
        rolloff: -12,
      },
      tremolo: {
        frequency: 1.2,
        depth: 0.2,
      },
      reverb: {
        decay: 0.8,
        wet: 0.3,
      },
    },
  },
  retro: {
    name: "Retro",
    oscillator: {
      type: "sawtooth",
    },
    envelope: {
      attack: 0.02,
      decay: 0.3,
      sustain: 0.3,
      release: 0.4,
    },
    effects: {
      filter: {
        frequency: 1500,
        rolloff: -24,
      },
      tremolo: {
        frequency: 0.6,
        depth: 0.4,
      },
      reverb: {
        decay: 1.2,
        wet: 0.5,
      },
    },
  },
};

// Pentatonic scale for an exotic jungle feel
const notes = ["C4", "D4", "F4", "G4", "A4", "C5", "D5"];
const minTimeBetweenNotes = 0.09; // Minimum interval between notes
const VOICE_COUNT = 16; // Adjusted voice count for balance

// Helper function to create the synth and effects chain
function createSynthInstance(preset: SynthPreset) {
  const filter = new Tone.Filter({
    frequency: preset.effects.filter.frequency,
    type: "lowpass",
    rolloff: preset.effects.filter.rolloff,
  }).toDestination();

  const tremolo = new Tone.Tremolo({
    frequency: preset.effects.tremolo.frequency,
    depth: preset.effects.tremolo.depth,
  }).connect(filter).start();

  const reverb = new Tone.Reverb({
    decay: preset.effects.reverb.decay,
    wet: preset.effects.reverb.wet,
  }).connect(tremolo);

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: preset.oscillator,
    envelope: preset.envelope,
    volume: -12, // Set volume during creation
  });
  synth.maxPolyphony = VOICE_COUNT;
  synth.connect(reverb);

  // Return the synth and effects nodes for potential disposal
  return { synth, filter, tremolo, reverb };
}

export function useChatSynth() {
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [currentPresetKey, setCurrentPresetKey] = useState<string>(
    () => loadSynthPreset() || "classic"
  );
  const synthRef = useRef<{
    synth: Tone.PolySynth;
    filter: Tone.Filter;
    tremolo: Tone.Tremolo;
    reverb: Tone.Reverb;
  } | null>(null);
  const lastNoteTimeRef = useRef(0);
  const isInitializingRef = useRef(false);
  const vibrate = useVibration(50, 30);

  // Initialize Tone.js context and create the synth instance
  const initializeAudio = useCallback(async () => {
    // Prevent concurrent initializations
    if (isInitializingRef.current || isAudioReady || Tone.context.state === 'running') {
        if (Tone.context.state === 'running' && !isAudioReady) {
             setIsAudioReady(true); // Already running, just update state
        }
        if (Tone.context.state === 'running' && !synthRef.current) {
             // Context running but synth lost (e.g., HMR without full reload), recreate synth
             console.log("Audio context running, recreating synth...");
             synthRef.current = createSynthInstance(SYNTH_PRESETS[currentPresetKey]);
             setIsAudioReady(true);
        }
        return;
    }
    isInitializingRef.current = true;

    try {
      console.log("Attempting to start Tone.js...");
      await Tone.start();
      console.log("Tone.js started successfully. State:", Tone.context.state);

      // Ensure context is running before creating synth
      // @ts-expect-error - Linter doesn't track state change possibility here
      if (Tone.context.state === 'running') {
          if (!synthRef.current) {
               synthRef.current = createSynthInstance(SYNTH_PRESETS[currentPresetKey]);
          }
          setIsAudioReady(true);
          console.log("Audio ready, synth created.");
      } else {
          console.warn("Tone.js context did not start or is suspended.");
          // Optionally, try resuming if suspended
          if (Tone.context.state === 'suspended') {
              await Tone.context.resume();
              // @ts-expect-error - Linter doesn't track state change after await resume()
              if (Tone.context.state === 'running') {
                  if (!synthRef.current) {
                      synthRef.current = createSynthInstance(SYNTH_PRESETS[currentPresetKey]);
                  }
                  setIsAudioReady(true);
                  console.log("Audio resumed and ready.");
              } else {
                  console.error("Failed to resume Tone.js context.");
              }
          }
      }
    } catch (error) {
      console.error("Error initializing Tone.js:", error);
      setIsAudioReady(false); // Explicitly set to false on error
    } finally {
      isInitializingRef.current = false;
    }
  }, [isAudioReady, currentPresetKey]); // Add currentPresetKey dependency


  // Effect to handle initial audio setup via user interaction
  useEffect(() => {
    // Attempt initialization immediately if context might already be running
    // Check if the context is in a state where it *could* become running
    if (Tone.context.state === 'running' || Tone.context.state === 'suspended') {
        initializeAudio();
    }

    const handleInteraction = () => {
      initializeAudio();
      // Clean up listeners after first interaction
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
    };

    // Add listeners if not already initialized
    if (!isAudioReady) {
        window.addEventListener("click", handleInteraction, { once: true });
        window.addEventListener("keydown", handleInteraction, { once: true });
    }

    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
    };
  }, [initializeAudio, isAudioReady]); // Depend on initializeAudio and isAudioReady


  // Effect for cleanup on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        console.log("Disposing synth on unmount...");
        synthRef.current.synth.dispose();
        synthRef.current.reverb.dispose();
        synthRef.current.tremolo.dispose();
        synthRef.current.filter.dispose();
        synthRef.current = null;
        // We generally don't want to close the global Tone.context here
        // as other components might use it.
      }
    };
  }, []); // Empty dependency array ensures this runs only on unmount

  // Function to change the synth preset
  const changePreset = useCallback((presetKey: string) => {
    if (SYNTH_PRESETS[presetKey] && presetKey !== currentPresetKey) {
      console.log("Changing preset to", presetKey);
      // Dispose old synth resources safely
      if (synthRef.current) {
        synthRef.current.synth.dispose();
        synthRef.current.reverb.dispose();
        synthRef.current.tremolo.dispose();
        synthRef.current.filter.dispose();
      }
      // Create new synth instance
      if (isAudioReady) { // Only create if audio context is ready
          synthRef.current = createSynthInstance(SYNTH_PRESETS[presetKey]);
      } else {
          synthRef.current = null; // Ensure ref is null if audio not ready
          console.warn("Audio not ready, preset change deferred until initialization.");
      }
      setCurrentPresetKey(presetKey);
      // Persist the new preset choice (implement saveSynthPreset if needed)
      // saveSynthPreset(presetKey);
    }
  }, [currentPresetKey, isAudioReady]); // Depend on current preset key and audio readiness

  // Function to play a note
  const playNote = useCallback(() => {
    // Ensure audio is ready and synth exists
    if (!isAudioReady || !synthRef.current || Tone.context.state !== 'running') {
        // Attempt to re-initialize if needed (e.g., context suspended)
        if (Tone.context.state !== 'running' && !isInitializingRef.current) {
            console.warn("Audio context not running. Attempting to initialize...");
            initializeAudio();
        }
        return;
    }

    const { synth } = synthRef.current;

    // Check active voices against the defined VOICE_COUNT
    const activeVoices = (synth as any)._voices?.length || 0; // Access internal _voices array if available
    if (activeVoices >= VOICE_COUNT) {
        console.debug(`Skipping note: Voice limit (${VOICE_COUNT}) reached.`);
        return;
    }


    const now = Tone.now();
    if (now - lastNoteTimeRef.current >= minTimeBetweenNotes) {
      const noteToPlay = notes[Math.floor(Math.random() * notes.length)];
      try {
        // Use a short duration like '32n' or '64n' for plucky sounds
        synth.triggerAttackRelease(noteToPlay, "32n", now);
        vibrate(); // Trigger vibration
        lastNoteTimeRef.current = now;
      } catch (error) {
        // This catch might be less necessary with the active voice check, but kept for safety
        console.debug("Skipping note due to timing or error:", error);
      }
    } else {
         //console.debug("Skipping note: Minimum time between notes not met.");
    }
  }, [isAudioReady, vibrate, initializeAudio]); // Add initializeAudio dependency

  return { playNote, currentPreset: currentPresetKey, changePreset, isAudioReady };
}

// Note: The createSynth function is now inlined as createSynthInstance
// and returns the nodes for disposal.
// The volume is set directly in the PolySynth constructor options.
