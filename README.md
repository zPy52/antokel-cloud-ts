# antokel-cloud — TypeScript SDK

Cloud SDK for Antokel engineers. TypeScript/Node.js port of the [`antokel-cloud`](https://pypi.org/project/antokel-cloud/) Python SDK.

## Installation

```bash
npm install antokel-cloud
# or
pnpm add antokel-cloud
```

## Requirements

- Node.js ≥ 18
- AWS credentials configured (env vars, `~/.aws/credentials`, or IAM role)

---

## S3

```ts
import * as fs from "fs";
import { AntokelAws } from "antokel-cloud";

const aws = new AntokelAws(); // reads AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
// or: new AntokelAws({ region: "us-east-1", accessKeyId: "...", secretAccessKey: "..." })

const s3 = aws.S3("my-bucket");
// with prefix: aws.S3("my-bucket", { prefix: "folder/subfolder" })
// trailing slash is also accepted and normalized

// Upload / download / move / delete
await s3.upload(fs.readFileSync("./local/file.pdf"), "path/on/s3.pdf");
// await s3.upload(fs.readFileSync("./local/file.pdf"), "path/on/s3.pdf", { storageClass: "glacier" });
await s3.download("path/on/s3.pdf", "./local/file.pdf");
await s3.download("path/on/s3.pdf", s3.as.base64); // "data:application/pdf;base64,..."
await s3.download("path/on/s3.pdf", s3.as.bytes);  // Buffer
await s3.move("old/path.pdf", "new/path.pdf");
await s3.remove("path/on/s3.pdf");

// Read/write text
const content = await s3.asText.read("notes.txt");
await s3.asText.write("hello world", "notes.txt");

// Stream lines (single S3 GET billed)
for await (const line of s3.asText.streamLines("data.csv")) {
  console.log(line);
}
```

`storageClass` is optional. Supported values are `standard`, `standard_ia`, `onezone_ia`, `intelligent_tiering`, `glacier_ir`, `glacier`, `deep_archive`, and `express_onezone`. If omitted, S3 uses its normal default storage class.

### Presigned URLs

```ts
import { AntokelAws } from "antokel-cloud";

const aws = new AntokelAws();
const s3 = aws.S3("bucket");

const selectedImage = fileInput.files?.[0];
if (!selectedImage) {
  throw new Error("No image selected");
}

const upload = await s3.presigned.upload("path/to/file.webp", {
  contentType: selectedImage.type,
});

const uploadResponse = await fetch(upload.url, {
  method: upload.method,
  headers: upload.headers,
  body: selectedImage,
});

if (!uploadResponse.ok) {
  throw new Error(`Upload failed with status ${uploadResponse.status}`);
}

const { bucket, pathToFile } = upload;
const getUrl = await s3.presigned.download(pathToFile);
```

Use `PUT` for browser uploads. A raw `fetch(..., { method: "POST", body: file })` request is not a valid S3 presigned upload flow, and S3 will not return JSON for that upload request.

---

## DynamoDB ORM

Schema-validated, fully type-safe ORM backed by `zod` (v3 and v4 compatible).

```ts
import { AntokelAws, field } from "antokel-cloud";
import { z } from "zod";

const aws = new AntokelAws({ region: "us-east-1" });

// 1. Define your schema with zod
const userSchema = z.object({
  pk:       z.string(),
  sk:       z.string(),
  username: z.string(),
  age:      z.number(),
  tags:     z.array(z.string()).optional(),
});

// 2. Create a table binding — TypeScript will infer the exact type
const users = aws.Dynamo({
  tableName:    "UsersTable",
  schema:       userSchema,
  partitionKey: "pk",
  sortKey:      "sk",
});

// 3. CRUD — schema validation runs on every read and write
await users.put({ pk: "user#123", sk: "profile", username: "Alice", age: 30 });

const user = await users.get("user#123", "profile");
// ^^ returns z.infer<typeof userSchema> | null  ✅ fully typed

await users.delete("user#123", "profile");

// 4. Query with chained field filters
const { items } = await users.query(
  "user#123",            // partition key value
  [
    field("age").isGreaterThan(18),
    field("username").startsWith("Ali"),
    field("tags").contains("admin"),
  ],
  { limit: 50, scanIndexForward: false }
);

// 5. Full table scan with filters
const { items: allAdmins } = await users.scan([
  field("tags").contains("admin"),
  field("age").isBetween(25, 40),
]);
```

### Available `field` operators

| Method | DynamoDB expression |
|---|---|
| `field("x").isEqualTo(v)` | `x = v` |
| `field("x").isLessThan(v)` | `x < v` |
| `field("x").isLessThanOrEqualTo(v)` | `x <= v` |
| `field("x").isGreaterThan(v)` | `x > v` |
| `field("x").isGreaterThanOrEqualTo(v)` | `x >= v` |
| `field("x").isBetween(a, b)` | `x BETWEEN a AND b` |
| `field("x").isAnyOf([...])` | `x IN (...)` |
| `field("x").contains(v)` | `contains(x, v)` |
| `field("x").startsWith(v)` | `begins_with(x, v)` |
| `field("x").exists()` | `attribute_exists(x)` |
| `field("x").notExists()` | `attribute_not_exists(x)` |
| `field("x").hasType("S")` | `attribute_type(x, S)` |

---

## Rekognition

The SDK provides a robust, strongly-typed wrapper around AWS Rekognition for image and video analysis. Valid inputs (`Source` type) include a URL string, a native `URL` object, an `ArrayBuffer`, a `Uint8Array`, or a Node `Buffer`.

```ts
import { AntokelAws } from "antokel-cloud";
import * as fs from "fs";

const aws = new AntokelAws(); // Automatically picks up region/credentials
const rekog = aws.Rekognition();

// From an image buffer
const buf = fs.readFileSync("path/to/image.jpg");
const labelsRes = await rekog.labels(buf);

console.log(labelsRes.toJson());
// => [{ name: "Person", confidence: 99.8, instances: [...] }, ...]

// From a URL directly
const faceRes = await rekog.facial("https://example.com/face.png");
console.log(faceRes.toJson()[0].attributes.smile); // typed as boolean

// Other operations
await rekog.properties("...");     // Image brightness, sharpness, contrast, dominant colors
await rekog.text("...");           // OCR text detection
await rekog.ppe("...");            // Personal Protective Equipment detection
await rekog.compareFaces(img1, img2); // Similarity score
```

---

## Transcribe

The SDK provides a high-level Amazon Transcribe wrapper for batch jobs. `transcribe.as.uri(...)` works with existing `s3://...` or `https://...` media URIs, while `transcribe.as.bytes(...)` and `transcribe.as.base64(...)` auto-stage audio to S3 before starting the job.

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

const byUri = await transcribe.as.uri("s3://media-bucket/audio.mp3", {
  mediaFormat: "mp3",
  languageCode: "en-US",
});

const byBytes = await transcribe.as.bytes(fs.readFileSync("./audio.mp3"), {
  mediaFormat: "mp3",
  languageCode: "en-US",
});

const byBase64 = await transcribe.as.base64(audioBase64, {
  mediaFormat: "wav",
  languageCode: "en-US",
});

console.log(byUri.text);
console.log(byUri.tokens[0]); // full AWS item order, punctuation included
console.log(byUri.words[0]);  // spoken words only, always timestamped
console.log(byUri.segments[0]);
```

### Transcribe result shape

- `text`: full transcript string
- `tokens`: ordered token stream from AWS, including punctuation tokens with `null` timestamps
- `words`: spoken-word subset with exact `startTimeSeconds` / `endTimeSeconds`
- `segments`: parsed `audio_segments` entries with transcript text and `itemIds`

`transcribe.as.bytes(...)` and `transcribe.as.base64(...)` require a staging bucket, either in `aws.Transcribe({ stagingBucket })` or per call. Provide exactly one of `languageCode` or `identifyLanguage: true`.

---

## EC2

```ts
const ec2 = aws.EC2();

// Find instances by name regex
const instances = await ec2.findByNameRegex("worker-.+");

// Manage a specific instance
const instance = ec2.Instance({
  id:             "i-0abc123",          // existing instance
  // OR create a new one:
  name:           "my-worker",
  machine:        "t4g.micro",
  mode:           "spot",               // "spot" | "on-demand"
  keyPair:        "my-keypair",
  securityGroups: ["sg-01234"],
  ami:            "ami-0c55b159cbfafe1f0",
  userData:       "#!/bin/bash\necho hello",
});

await instance.create();
await instance.start();
await instance.stop();
await instance.terminate();
```

---

## License

Apache-2.0 © Antokel
