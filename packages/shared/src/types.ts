export type TimeSignature = [number, number];

export type TrackType = "audio" | "midi" | "bus" | "master";

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  color: string;
  index: number;
  height?: number;
  volumeDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  arm: boolean;
  inputDeviceId?: string;
  outputTrackId?: string;
  insertIds: string[];
  sendIds: string[];
}

export type RegionType = "audio" | "midi";

export interface Fade {
  type: "linear" | "exponential" | "logarithmic" | "sCurve";
  duration: number;
}

export interface Region {
  id: string;
  trackId: string;
  type: RegionType;
  name?: string;
  position: number;
  duration: number;
  offset: number;
  fadeIn: Fade;
  fadeOut: Fade;
  audioFileId?: string;
  sampleId?: string;
}

export interface Note {
  id: string;
  regionId: string;
  position: number;
  duration: number;
  pitch: number;
  velocity: number;
}

export interface AutomationTarget {
  type: "volume" | "pan" | "device";
  trackId: string;
  deviceId?: string;
  parameter?: string;
}

export interface AutomationLane {
  id: string;
  trackId: string;
  target: AutomationTarget;
  height?: number;
}

export interface AutomationPoint {
  id: string;
  laneId: string;
  position: number;
  value: number;
}

export interface TransportState {
  position: number;
  isPlaying: boolean;
  isRecording: boolean;
  bpm: number;
  timeSignature: TimeSignature;
  loopEnabled: boolean;
  loopStart?: number;
  loopEnd?: number;
}

export interface ProjectState {
  projectId: string;
  name: string;
  sampleRate: number;
  bufferSize: number;
  transport: TransportState;
  tracks: Track[];
  regions: Region[];
  notes: Note[];
  automationLanes: AutomationLane[];
  automationPoints: AutomationPoint[];
  devices: Device[];
  masterVolumeDb: number;
}

export interface Device {
  id: string;
  name: string;
  category: "instrument" | "audio-effect" | "midi-effect";
  vendor?: string;
  parameters: DeviceParameter[];
}

export interface DeviceParameter {
  id: string;
  name: string;
  value: number | boolean;
  min?: number;
  max?: number;
  defaultValue?: number | boolean;
}

export interface Selection {
  trackId?: string;
  regionId?: string;
  noteIds?: string[];
}
