// Voice Prompts for Interactive Recording
// Using Browser Speech Synthesis API with optimized settings

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

// Play voice prompt using optimized Speech Synthesis
export const playVoicePrompt = (text: string): Promise<void> => {
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
    utterance.rate = 0.85; // Slower for better clarity
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
      console.log('Using voice:', selectedVoice.name);
    }

    utterance.onend = () => {
      console.log('Voice prompt finished');
      resolve();
    };
    
    utterance.onerror = (error) => {
      console.error('Speech synthesis error:', error);
      resolve(); // Resolve anyway to not block the flow
    };

    // Small delay to ensure speech synthesis is ready
    setTimeout(() => {
      try {
        speechSynthesis.speak(utterance);
        console.log('Playing voice prompt:', text);
      } catch (error) {
        console.error('Error speaking:', error);
        resolve();
      }
    }, 100);
  });
};

// Preload voices
export const preloadVoices = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        console.log('Voices loaded:', voices.length);
        console.log('Available voices:', voices.map(v => v.name).join(', '));
        resolve();
      }
    };

    // Try to load voices
    loadVoices();

    // Listen for voices changed event
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Timeout after 2 seconds
    setTimeout(() => {
      loadVoices();
      resolve();
    }, 2000);
  });
};

// Stop any ongoing speech
export const stopVoicePrompt = (): void => {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
};

// Test function to check if speech works
export const testVoice = async (): Promise<boolean> => {
  try {
    await preloadVoices();
    await playVoicePrompt("Testing voice");
    return true;
  } catch (error) {
    console.error('Voice test failed:', error);
    return false;
  }
};



