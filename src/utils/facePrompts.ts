// Face Test Voice Prompts
// Random medical questions for facial assessment

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

// Play voice prompt using Speech Synthesis
export const playFacePrompt = (text: string): Promise<void> => {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported');
      resolve();
      return;
    }

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Optimized settings for clarity
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';
    
    // Try to get the best available voice
    const voices = speechSynthesis.getVoices();
    
    // Priority order for voice selection
    const preferredVoiceNames = [
      'Google US English',
      'Microsoft Zira',
      'Microsoft David',
      'Samantha',
      'Karen',
      'Moira',
      'Tessa',
      'Alex',
    ];
    
    let selectedVoice = null;
    
    // Try to find a preferred voice
    for (const voiceName of preferredVoiceNames) {
      selectedVoice = voices.find(voice => 
        voice.name.includes(voiceName) && voice.lang.startsWith('en')
      );
      if (selectedVoice) break;
    }
    
    // Fallback to any English voice
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => 
        voice.lang.startsWith('en-US') || voice.lang.startsWith('en')
      );
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log('Using voice for face test:', selectedVoice.name);
    }

    utterance.onend = () => {
      console.log('Face prompt finished');
      resolve();
    };
    
    utterance.onerror = (error) => {
      console.error('Speech synthesis error:', error);
      resolve();
    };

    // Small delay to ensure speech synthesis is ready
    setTimeout(() => {
      try {
        speechSynthesis.speak(utterance);
        console.log('Playing face prompt:', text);
      } catch (error) {
        console.error('Error speaking:', error);
        resolve();
      }
    }, 100);
  });
};

// Preload voices
export const preloadFaceVoices = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        console.log('Face test voices loaded:', voices.length);
        resolve();
      }
    };

    loadVoices();

    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    setTimeout(() => {
      loadVoices();
      resolve();
    }, 2000);
  });
};

// Stop any ongoing speech
export const stopFacePrompt = (): void => {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
};
