# Rekognition

## Overview

Use `aws.Rekognition()` for strongly typed AWS Rekognition operations. The README documents image and video analysis usage and lists valid `Source` inputs.

## Supported Inputs

The README states that valid `Source` values include:

- URL string
- native `URL` object
- `ArrayBuffer`
- `Uint8Array`
- Node `Buffer`

When the user provides any of these shapes, keep examples in that same format.

## Setup Pattern

```ts
import { AntokelAws } from "antokel-cloud";
import * as fs from "fs";

const aws = new AntokelAws();
const rekog = aws.Rekognition();
```

## Common Tasks

### Detect Labels

```ts
const buf = fs.readFileSync("path/to/image.jpg");
const labelsRes = await rekog.labels(buf);

console.log(labelsRes.toJson());
```

Use this when the user wants object or scene labeling.

### Analyze Facial Attributes

```ts
const faceRes = await rekog.facial("https://example.com/face.png");
console.log(faceRes.toJson()[0].attributes.smile);
```

The README example describes `smile` as a typed boolean. Preserve that expectation.

### Other Documented Operations

```ts
await rekog.properties("...");
await rekog.text("...");
await rekog.ppe("...");
await rekog.compareFaces(img1, img2);
```

Use these mappings:

- `properties(...)` for image brightness, sharpness, contrast, and dominant colors
- `text(...)` for OCR text detection
- `ppe(...)` for Personal Protective Equipment detection
- `compareFaces(img1, img2)` for similarity scoring between two images

## Important Caveats

- Keep claims limited to operations shown in the README.
- Do not infer additional Rekognition APIs that are not documented here.
- Prefer `toJson()` in example outputs because that is the documented access pattern.

## Request Mapping

- “Analyze labels in an image” -> `rekog.labels(source)`
- “Read face attributes from a URL” -> `rekog.facial(url)`
- “Run OCR” -> `rekog.text(source)`
- “Inspect image properties” -> `rekog.properties(source)`
- “Check PPE” -> `rekog.ppe(source)`
- “Compare two faces” -> `rekog.compareFaces(sourceA, sourceB)`
