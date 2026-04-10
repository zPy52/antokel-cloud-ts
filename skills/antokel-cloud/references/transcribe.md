# Transcribe

## Overview

Use `aws.Transcribe(config?)` for batch Amazon Transcribe jobs with a high-level, final-result API. The README documents three payload selectors on `transcribe.as`: `uri(...)`, `bytes(...)`, and `base64(...)`.

## Setup Pattern

```ts
import * as fs from "fs";
import { AntokelAws } from "antokel-cloud";

const aws = new AntokelAws();

const transcribe = aws.Transcribe({
  stagingBucket: "my-transcribe-staging",
  stagingPrefix: "incoming-audio",
  outputBucket: "my-transcribe-output",
  outputPrefix: "jobs",
});
```

## Common Tasks

### Transcribe Existing Media By URI

```ts
const result = await transcribe.as.uri("s3://media-bucket/audio.mp3", {
  mediaFormat: "mp3",
  languageCode: "en-US",
});
```

Use `as.uri(...)` for existing `s3://...` or `https://...` media.

### Transcribe Raw Audio Bytes

```ts
const result = await transcribe.as.bytes(fs.readFileSync("./audio.mp3"), {
  mediaFormat: "mp3",
  languageCode: "en-US",
});
```

Use `as.bytes(...)` when the caller already has a `Buffer`, `Uint8Array`, or `ArrayBuffer`. This flow stages the payload to S3 first, so it requires a staging bucket.

### Transcribe Base64 Audio

```ts
const result = await transcribe.as.base64(audioBase64, {
  mediaFormat: "wav",
  languageCode: "en-US",
});
```

`as.base64(...)` accepts either raw base64 strings or `data:*;base64,...` URLs and routes through the same staged-upload flow as `as.bytes(...)`.

## Result Contract

The README-backed response shape includes:

- `text` for the full transcript string
- `tokens` for the ordered AWS token stream, including punctuation items with `null` timestamps
- `words` for spoken-word items only, always with exact `startTimeSeconds` and `endTimeSeconds`
- `segments` for parsed `audio_segments` entries

Example access pattern:

```ts
console.log(result.text);
console.log(result.tokens[0]);
console.log(result.words[0]);
console.log(result.segments[0]);
```

## Important Caveats

- V1 is batch transcription only; do not suggest streaming APIs.
- `as.bytes(...)` and `as.base64(...)` require `stagingBucket`, either in `aws.Transcribe(...)` config or the per-call options.
- Require exactly one of `languageCode` or `identifyLanguage: true`.
- `as.uri(...)` is for `s3://...` and `http(s)://...` media URIs only. Do not pass raw base64 or binary payloads to it.

## Request Mapping

- “Transcribe an S3 audio file” -> `transcribe.as.uri("s3://...", options)`
- “Transcribe bytes from a file buffer” -> `transcribe.as.bytes(buffer, options)`
- “Transcribe a base64 audio payload” -> `transcribe.as.base64(base64, options)`
- “Get per-word timestamps” -> read `result.words`
- “Keep punctuation in transcript order” -> read `result.tokens`
