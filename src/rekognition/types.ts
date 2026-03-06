export interface RekognitionLabelInstance {
  boundingBox: RekognitionBoundingBox;
  confidence: number;
}

export interface RekognitionLabel {
  name: string;
  confidence: number;
  parents: string[];
  instances?: RekognitionLabelInstance[];
}

export interface RekognitionImageProperties {
  brightness: number;
  sharpness: number;
  contrast: number;
  dominantColors: string[];
}

export interface RekognitionBoundingBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface RekognitionEmotion {
  type: string;
  confidence: number;
}

export interface RekognitionFaceAttributes {
  smile: boolean;
  eyeglasses: boolean;
  eyesOpen: boolean;
  mouthOpen: boolean;
  beard: boolean;
  occluded: boolean;
}

export interface RekognitionAgeRange {
  min: number;
  max: number;
}

export interface RekognitionFaceDetail {
  boundingBox: RekognitionBoundingBox;
  age: RekognitionAgeRange;
  gender: string;
  emotions: RekognitionEmotion[];
  attributes: RekognitionFaceAttributes;
}

export interface RekognitionCompareFacesResult {
  matched: boolean;
  similarity: number;
}

export interface RekognitionTextDetection {
  text: string;
  type: 'LINE' | 'WORD';
  boundingBox: RekognitionBoundingBox;
  confidence: number;
  id?: number;
  parentId?: number;
}

export interface RekognitionTextResult {
  fullText: string;
  lines: string[];
  detections?: RekognitionTextDetection[];
}

export interface RekognitionPPEEquipment {
  type: string;
  confidence: number;
  coversBodyPart: boolean;
  boundingBox?: RekognitionBoundingBox;
  bodyPart?: string;
}

export interface RekognitionPPEPerson {
  personId: number;
  boundingBox: RekognitionBoundingBox;
  equipment: RekognitionPPEEquipment[];
}

// Wrapper classes to provide strictly typed output with .toJson() capability

export class SubmoduleRekognitionLabels {
  constructor(public readonly items: RekognitionLabel[]) {}
  public toJson() { return this.items; }
}

export class SubmoduleRekognitionProperties {
  constructor(public readonly properties: RekognitionImageProperties) {}
  public toJson() { return this.properties; }
}

export class SubmoduleRekognitionFaces {
  constructor(public readonly faces: RekognitionFaceDetail[]) {}
  public toJson() { return this.faces; }
}

export class SubmoduleRekognitionCompare {
  constructor(public readonly result: RekognitionCompareFacesResult) {}
  public toJson() { return this.result; }
}

export class SubmoduleRekognitionText {
  constructor(public readonly result: RekognitionTextResult) {}
  public toJson() { return this.result; }
}

export class SubmoduleRekognitionPPE {
  constructor(public readonly persons: RekognitionPPEPerson[]) {}
  public toJson() { return this.persons; }
}
