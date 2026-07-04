// Voice Analysis Backend API Integration

export interface VoiceAnalysisMetadata {
  ac: number;  // age 60+ (0 or 1)
  nth: number; // neurological history (0 or 1)
  htn: number; // hypertension (0 or 1)
  updrs: number; // UPDRS score (0-108)
}

export interface VoiceAnalysisResult {
  risk_score: number;
  risk_level: 'Low' | 'Medium' | 'High';
}

// Backend base URL. Configurable via the VITE_API_BASE_URL env var
// (see .env.example); falls back to localhost for local development.
const BACKEND_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5050';

export const analyzeVoice = async (
  audioBlob: Blob,
  metadata: VoiceAnalysisMetadata
): Promise<VoiceAnalysisResult> => {
  try {
    console.log('Preparing FormData...');
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('ac', metadata.ac.toString());
    formData.append('nth', metadata.nth.toString());
    formData.append('htn', metadata.htn.toString());
    formData.append('updrs', metadata.updrs.toString());

    console.log('Sending request to:', `${BACKEND_URL}/predict`);
    const response = await fetch(`${BACKEND_URL}/predict`, {
      method: 'POST',
      body: formData,
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      let errorMessage = 'Analysis failed';
      try {
        const error = await response.json();
        errorMessage = error.error || error.details || errorMessage;
      } catch (e) {
        errorMessage = `Server error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log('Analysis result:', result);
    return result;
  } catch (error) {
    console.error('API Error:', error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend. Make sure server is running on port 5050.');
    }
    throw error;
  }
};
