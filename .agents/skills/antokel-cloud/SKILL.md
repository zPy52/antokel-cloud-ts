---
name: antokel-cloud
description: Comprehensive guidance for using the antokel-cloud TypeScript SDK to work with S3, DynamoDB, Rekognition, and EC2. Use when Codex needs to write, review, explain, document, or troubleshoot code that imports `antokel-cloud`, especially for `AntokelAws`, S3 file operations, presigned URLs, zod-backed DynamoDB tables, Rekognition analysis, or EC2 instance management.
---

# Antokel Cloud

## Overview

Use this skill when a task depends on the `antokel-cloud` SDK. Treat `README.md` in the repo as the canonical source of behavior and examples. Use source inspection only to confirm symbol names or signatures that the README already implies.

## Workflow

1. Start with [overview.md](./references/overview.md) to confirm package scope, requirements, and the `AntokelAws` entrypoint.
2. Load only the subsystem reference that matches the task:
   - [s3.md](./references/s3.md) for uploads, downloads, text helpers, prefixes, and presigned URLs
   - [dynamodb.md](./references/dynamodb.md) for schema-bound tables, CRUD, queries, scans, and `field(...)`
   - [rekognition.md](./references/rekognition.md) for image analysis inputs and operations
   - [ec2.md](./references/ec2.md) for instance lookup and lifecycle management
3. Prefer README-backed examples and return-shape expectations when generating code.
4. Preserve documented caveats exactly. In particular, keep the S3 presigned browser-upload flow on `PUT` and do not invent a `POST` JSON upload flow.
5. If README wording leaves a naming detail ambiguous, inspect source just enough to confirm the exported symbol or method signature. Do not infer undocumented capabilities from implementation details.

## Guidance

- Use `AntokelAws` as the top-level factory for all services.
- Keep examples aligned with documented constructor patterns, method names, and argument order.
- When the user asks for “how do I do X with antokel-cloud?”, map the request to the smallest relevant reference file instead of loading every SDK detail.
- When documenting or reviewing code, call out constraints explicitly: Node.js 18+, AWS credentials required, and zod schema validation for the DynamoDB ORM.

## Reference Map

- Read [overview.md](./references/overview.md) for package-wide setup and cross-cutting assumptions.
- Read [s3.md](./references/s3.md) when the task involves files, object storage, prefixes, text helpers, or presigned URLs.
- Read [dynamodb.md](./references/dynamodb.md) when the task involves typed models, zod schemas, CRUD, queries, scans, or filter expressions.
- Read [rekognition.md](./references/rekognition.md) when the task involves image sources, label detection, face analysis, OCR, PPE, or face comparison.
- Read [ec2.md](./references/ec2.md) when the task involves instance lookup, creation parameters, or start/stop/terminate flows.
