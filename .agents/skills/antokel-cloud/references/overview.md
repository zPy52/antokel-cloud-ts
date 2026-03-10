# Antokel Cloud Overview

## Purpose

`antokel-cloud` is a TypeScript/Node.js SDK for Antokel engineers. The README presents it as a port of the Python `antokel-cloud` package and documents four main areas: S3, DynamoDB, Rekognition, and EC2.

## Requirements

- Install with `npm install antokel-cloud` or `pnpm add antokel-cloud`.
- Require Node.js 18 or newer.
- Require AWS credentials through environment variables, `~/.aws/credentials`, or an IAM role.

## Entry Point

Create services through `AntokelAws`:

```ts
import { AntokelAws } from "antokel-cloud";

const aws = new AntokelAws();
```

README-backed constructor patterns:

- `new AntokelAws()` reads AWS region and credentials from the environment.
- `new AntokelAws({ region, accessKeyId, secretAccessKey })` supplies explicit configuration.

Use the resulting instance to create service wrappers:

- `aws.S3(bucketName, options?)`
- `aws.Dynamo(config)`
- `aws.Rekognition()`
- `aws.EC2()`

## Agent Rules

- Treat README examples as the authoritative public contract.
- Use source only to confirm a method or export name the README already implies.
- Do not add undocumented service wrappers or unsupported convenience APIs.
- Keep generated examples focused on the service the user asked for.

## Task Routing

- If the user needs file upload, download, base64, bytes, text helpers, or presigned URLs, read [s3.md](./s3.md).
- If the user needs typed DynamoDB tables, zod schemas, CRUD, query filters, or scans, read [dynamodb.md](./dynamodb.md).
- If the user needs image analysis or face comparison, read [rekognition.md](./rekognition.md).
- If the user needs instance lookup or instance lifecycle actions, read [ec2.md](./ec2.md).
