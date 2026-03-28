import {
  RekognitionClient,
  DetectLabelsCommand,
  DetectFacesCommand,
  CompareFacesCommand,
  DetectTextCommand,
  DetectProtectiveEquipmentCommand,
  BoundingBox,
} from '@aws-sdk/client-rekognition';
import { Source } from '../../types';
import { toImageBytes } from './utils';
import {
  RekognitionLabel,
  RekognitionFaceDetail,
  RekognitionImageProperties,
  RekognitionCompareFacesResult,
  RekognitionTextResult,
  RekognitionPPEPerson,
  SubmoduleRekognitionLabels,
  SubmoduleRekognitionProperties,
  SubmoduleRekognitionFaces,
  SubmoduleRekognitionCompare,
  SubmoduleRekognitionText,
  SubmoduleRekognitionPPE,
  RekognitionBoundingBox,
} from './types';

export * from './types';

function toBoundingBox(box: BoundingBox | undefined): RekognitionBoundingBox {
  if (!box) {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
  return {
    top: box.Top ?? 0,
    left: box.Left ?? 0,
    width: box.Width ?? 0,
    height: box.Height ?? 0,
  };
}

export class SubmoduleRekognition {
  constructor(private readonly client: RekognitionClient) {}

  public async labels(input: Source): Promise<SubmoduleRekognitionLabels> {
    const bytes = await toImageBytes(input);
    const command = new DetectLabelsCommand({
      Image: { Bytes: bytes },
      Features: ['GENERAL_LABELS'],
    });
    const response = await this.client.send(command);

    const mappedLabels: RekognitionLabel[] = (response.Labels ?? []).map((label) => ({
      name: label.Name ?? '',
      confidence: label.Confidence ?? 0,
      parents: (label.Parents ?? []).map((p) => p.Name ?? '').filter(Boolean),
      instances: (label.Instances ?? []).map((instance) => ({
        boundingBox: toBoundingBox(instance.BoundingBox),
        confidence: instance.Confidence ?? 0,
      })),
    }));

    return new SubmoduleRekognitionLabels(mappedLabels);
  }

  public async properties(input: Source): Promise<SubmoduleRekognitionProperties> {
    const bytes = await toImageBytes(input);
    const command = new DetectLabelsCommand({
      Image: { Bytes: bytes },
      Features: ['IMAGE_PROPERTIES'],
    });
    const response = await this.client.send(command);

    const quality = response.ImageProperties?.Quality;
    const colors = response.ImageProperties?.DominantColors ?? [];

    const mappedProperties: RekognitionImageProperties = {
      brightness: quality?.Brightness ?? 0,
      sharpness: quality?.Sharpness ?? 0,
      contrast: quality?.Contrast ?? 0,
      dominantColors: colors.map((c) => c.SimplifiedColor ?? c.HexCode ?? '').filter(Boolean),
    };

    return new SubmoduleRekognitionProperties(mappedProperties);
  }

  public async facial(input: Source): Promise<SubmoduleRekognitionFaces> {
    const bytes = await toImageBytes(input);
    const command = new DetectFacesCommand({
      Image: { Bytes: bytes },
      Attributes: ['ALL'],
    });
    const response = await this.client.send(command);

    const mappedFaces: RekognitionFaceDetail[] = (response.FaceDetails ?? []).map((face) => ({
      boundingBox: toBoundingBox(face.BoundingBox),
      age: {
        min: face.AgeRange?.Low ?? 0,
        max: face.AgeRange?.High ?? 0,
      },
      gender: face.Gender?.Value ?? '',
      emotions: (face.Emotions ?? []).map((e) => ({
        type: e.Type ?? '',
        confidence: e.Confidence ?? 0,
      })),
      attributes: {
        smile: face.Smile?.Value ?? false,
        eyeglasses: face.Eyeglasses?.Value ?? false,
        eyesOpen: face.EyesOpen?.Value ?? false,
        mouthOpen: face.MouthOpen?.Value ?? false,
        beard: face.Beard?.Value ?? false,
        occluded: face.FaceOccluded?.Value ?? false,
      },
    }));

    return new SubmoduleRekognitionFaces(mappedFaces);
  }

  public async compareFaces(
    sourceInput: Source,
    targetInput: Source,
    similarityThreshold = 80,
  ): Promise<SubmoduleRekognitionCompare> {
    const [sourceBytes, targetBytes] = await Promise.all([
      toImageBytes(sourceInput),
      toImageBytes(targetInput),
    ]);

    const command = new CompareFacesCommand({
      SourceImage: { Bytes: sourceBytes },
      TargetImage: { Bytes: targetBytes },
      SimilarityThreshold: similarityThreshold,
    });
    const response = await this.client.send(command);

    const bestMatch = response.FaceMatches?.[0];
    const result: RekognitionCompareFacesResult = {
      matched: Boolean(bestMatch),
      similarity: bestMatch?.Similarity ?? 0,
    };

    return new SubmoduleRekognitionCompare(result);
  }

  public async text(input: Source): Promise<SubmoduleRekognitionText> {
    const bytes = await toImageBytes(input);
    const command = new DetectTextCommand({
      Image: { Bytes: bytes },
    });
    const response = await this.client.send(command);

    const detections = response.TextDetections ?? [];
    const lines = detections
      .filter((d) => d.Type === 'LINE')
      .map((d) => d.DetectedText ?? '')
      .filter(Boolean);

    const mappedResult: RekognitionTextResult = {
      fullText: detections.map((d) => d.DetectedText ?? '').join(' '),
      lines,
      detections: detections.map((d) => ({
        text: d.DetectedText ?? '',
        type: d.Type === 'LINE' ? 'LINE' : 'WORD',
        boundingBox: toBoundingBox(d.Geometry?.BoundingBox),
        confidence: d.Confidence ?? 0,
        id: d.Id,
        parentId: d.ParentId,
      })),
    };

    return new SubmoduleRekognitionText(mappedResult);
  }

  public async ppe(input: Source): Promise<SubmoduleRekognitionPPE> {
    const bytes = await toImageBytes(input);
    const command = new DetectProtectiveEquipmentCommand({
      Image: { Bytes: bytes },
    });
    const response = await this.client.send(command);

    const mappedPersons: RekognitionPPEPerson[] = (response.Persons ?? []).map(
      (person, index) => {
        const equipment = [];
        for (const part of person.BodyParts ?? []) {
          for (const item of part.EquipmentDetections ?? []) {
            equipment.push({
              type: item.Type ?? '',
              confidence: item.Confidence ?? 0,
              coversBodyPart: item.CoversBodyPart?.Value ?? false,
              boundingBox: toBoundingBox(item.BoundingBox),
              bodyPart: part.Name,
            });
          }
        }
        return {
          personId: index,
          boundingBox: toBoundingBox(person.BoundingBox),
          equipment,
        };
      },
    );

    return new SubmoduleRekognitionPPE(mappedPersons);
  }
}
