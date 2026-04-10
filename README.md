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
- AWS credentials configured (env vars, `~/.aws/credentials`, or IAM role) for `AntokelAws`
- OVH Object Storage credentials for `AntokelOVH`
- Local `ssh` installed if you want to run EC2 remote commands

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
  expiresInSeconds: 1800, // 30 minutes
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
const getUrl = await s3.presigned.download(pathToFile, {
  expiresInSeconds: 1800, // 30 minutes
});
```

Presigned URLs default to `900` seconds (15 minutes) if you omit `expiresInSeconds`. Set a custom TTL when you need temporary access, up to `604800` seconds (7 days).

Use `PUT` for browser uploads. A raw `fetch(..., { method: "POST", body: file })` request is not a valid S3 presigned upload flow, and S3 will not return JSON for that upload request.

---

## OVH Object Storage

```ts
import * as fs from "fs";
import { AntokelOVH } from "antokel-cloud";

const ovh = new AntokelOVH({
  region: "gra",
  accessKeyId: "...",
  secretAccessKey: "...",
});

const storage = ovh.ObjectStorage("my-bucket");
// with prefix: ovh.ObjectStorage("my-bucket", { prefix: "folder/subfolder" })

await storage.upload(fs.readFileSync("./local/file.pdf"), "path/on/ovh.pdf");
await storage.download("path/on/ovh.pdf", "./local/file.pdf");
await storage.download("path/on/ovh.pdf", storage.as.bytes);
await storage.download("path/on/ovh.pdf", storage.as.base64);
await storage.move("old/path.pdf", "new/path.pdf");
await storage.remove("path/on/ovh.pdf");

await storage.asText.write("hello world", "notes.txt");
const content = await storage.asText.read("notes.txt");

const upload = await storage.presigned.upload("path/to/file.webp", {
  contentType: "image/webp",
  expiresInSeconds: 1800,
});
```

`AntokelOVH` uses the OVHcloud `io` endpoint (`https://s3.<region>.io.cloud.ovh.net`) with path-style access so presigned URLs work against the S3-compatible Object Storage API.

Supported OVH storage classes for `storage.upload(..., { storageClass })` are:

- `high_performance`
- `standard`
- `infrequent_access`
- `active_archive`
- `cold_archive`

Regional availability follows OVHcloud's current Object Storage matrix:

- `high_performance` is available in 1-AZ regions such as `gra`, `rbx`, `sbg`, `de`, `uk`, `waw`, `bhs`, `ca-east-tor`, `sgp`, `ap-southeast-syd`, and `ap-south-mum`
- `active_archive` is available in `eu-west-par` and `eu-south-mil`
- `cold_archive` is available only in `eu-west-par`

Presigned URLs default to `900` seconds (15 minutes) if you omit `expiresInSeconds`. Upload URLs use `PUT`, matching OVHcloud's S3-compatible presigned flow.

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
  ssh: {
    user:           "ubuntu",
    privateKeyPath: "/Users/me/.ssh/my-worker.pem",
    // or: privateKeyPem: process.env.MY_WORKER_PRIVATE_KEY_PEM,
    // optional:
    // host: "ec2-1-2-3-4.compute.amazonaws.com",
    // port: 22,
    // preferPrivateIp: true,
  },
});

const instanceId = await instance.create();
console.log(instanceId);
console.log(instance.id); // same value after create()

await instance.start();

const remote = await instance.run("npm run worker", {
  sessionName: "my-screen",
  workingDirectory: "/srv/app",
  env: {
    NODE_ENV: "production",
  },
});

console.log(remote.sessionName); // "my-screen"
console.log(await remote.status()); // { state: "running" } or { state: "finished", exitCode: ... }
console.log(await remote.readOutput());

const finished = await remote.wait({ timeoutMs: 60_000 });
console.log(finished.exitCode, finished.output);

await remote.stop(); // sends: screen -S my-screen -X quit

await instance.stop();
await instance.terminate();
```

### EC2 notes

- `create()` returns the resolved EC2 instance ID and also updates `instance.id`
- If `instance.id` already exists, `create()` returns it without creating a second instance
- Remote command execution is Linux-only in v1 and requires the instance to already be in the `running` state
- Remote command execution requires `ssh.user` plus either `ssh.privateKeyPath` or `ssh.privateKeyPem`
- `.ppk` keys are not supported in v1; use PEM/OpenSSH private keys
- `keyPair` is still used for EC2 creation, but SSH authentication uses only the provided private key
- If `ssh.host` is omitted, the SDK resolves the host from EC2 metadata using public DNS/IP first, then private IP. Set `preferPrivateIp: true` to flip that order
- Remote commands run inside detached `screen` sessions and write combined output to `~/.antokel-cloud/ec2/<sessionName>/output.log`
- The remote instance must already have `bash` and `screen` installed
- The returned handle is intentionally non-interactive. To manually reattach, use your own SSH command and run `screen -r <sessionName>` on the instance

---

## License

Apache-2.0 © Antokel
