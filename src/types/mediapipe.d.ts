// MediaPipe type declarations
declare global {
  interface Window {
    FaceMesh: any;
    FACEMESH_TESSELATION: number[][];
    Hands: any;
  }
}

export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

export interface FaceMeshResults {
  multiFaceLandmarks?: FaceLandmark[][];
  image: HTMLVideoElement;
}

export interface FacialData {
  blinkCount: number;
  leftEyeWasOpen: boolean;
  rightEyeWasOpen: boolean;
  motionValues: number[];
  asymmetryValues: number[];
  previousLandmarks: FaceLandmark[] | null;
}

export interface RiskResult {
  percentage: number;
  level: 'Low' | 'Medium' | 'High';
  color: string;
  details: {
    blinkRate: number;
    motion: number;
    asymmetry: number;
  };
}

export {};
