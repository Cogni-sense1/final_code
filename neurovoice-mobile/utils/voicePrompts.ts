// Voice Prompts for Interactive Recording
// Using expo-speech for React Native

import * as Speech from 'expo-speech';

export interface VoicePrompt {
  id: number;
  text: string;
  displayText: string;
  timing: number; // When to play (in seconds from start)
}

// Medical questions for voice recording (15 seconds total)
export const VOICE_PROMPTS: VoicePrompt[] = [
  {
    id: 1,
    text: "Please say your full name and age.",
    displayText: "Say your full name and age",
    timing: 0,
  },
  {
    id: 2,
    text: "Describe how you are feeling today.",
    displayText: "Describe how you're feeling today",
    timing: 5,
  },
  {
    id: 3,
    text: "Count from one to three slowly.",
    displayText: "Count from 1 to 3 slowly",
    timing: 10,
  },
];

// Play voice prompt using expo-speech
export const playVoicePrompt = (text: string): Promise<void> => {
  return new Promise((resolve) => {
    Speech.speak(text, {
      language: 'en-US',
      rate: 0.85,
      onDone: () => resolve(),
      onError: () => resolve(),
    });
  });
};

// Stop any ongoing speech
export const stopVoicePrompt = (): void => {
  Speech.stop();
};
