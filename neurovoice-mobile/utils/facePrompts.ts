// Face Test Voice Prompts
// Random medical questions for facial assessment
// Using expo-speech for React Native

import * as Speech from 'expo-speech';

export interface FacePrompt {
  id: number;
  text: string;
  displayText: string;
}

// Medical questions for face test (randomly selected)
export const FACE_PROMPTS: FacePrompt[] = [
  {
    id: 1,
    text: "What symptoms did you feel today?",
    displayText: "What symptoms did you feel today?",
  },
  {
    id: 2,
    text: "How would you rate your energy level today?",
    displayText: "How would you rate your energy level today?",
  },
  {
    id: 3,
    text: "Have you experienced any tremors or shaking?",
    displayText: "Have you experienced any tremors or shaking?",
  },
  {
    id: 4,
    text: "Describe any changes in your movement or balance.",
    displayText: "Describe any changes in your movement or balance.",
  },
  {
    id: 5,
    text: "How has your sleep quality been recently?",
    displayText: "How has your sleep quality been recently?",
  },
  {
    id: 6,
    text: "Have you noticed any stiffness in your muscles?",
    displayText: "Have you noticed any stiffness in your muscles?",
  },
  {
    id: 7,
    text: "Describe your mood and emotional state today.",
    displayText: "Describe your mood and emotional state today.",
  },
  {
    id: 8,
    text: "Have you experienced any difficulty with coordination?",
    displayText: "Have you experienced any difficulty with coordination?",
  },
];

// Get a random prompt
export const getRandomFacePrompt = (): FacePrompt => {
  const randomIndex = Math.floor(Math.random() * FACE_PROMPTS.length);
  return FACE_PROMPTS[randomIndex];
};

// Play face prompt using expo-speech
export const playFacePrompt = (text: string): Promise<void> => {
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
export const stopFacePrompt = (): void => {
  Speech.stop();
};
