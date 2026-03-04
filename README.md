# @antokel/cloud — TypeScript SDK

Cloud SDK for Antokel engineers. TypeScript/Node.js port of the [`antokel-cloud`](https://pypi.org/project/antokel-cloud/) Python SDK.

## Installation

```bash
npm install @antokel/cloud
# or
pnpm add @antokel/cloud
```

## Requirements

- Node.js ≥ 18
- AWS credentials configured (env vars, `~/.aws/credentials`, or IAM role)

---

## S3

```ts
import { AntokelAws } from "@antokel/cloud";

const aws = new AntokelAws(); // reads AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
// or: new AntokelAws({ region: "us-east-1", accessKeyId: "...", secretAccessKey: "..." })

const s3 = aws.S3("my-bucket");
// with prefix: aws.S3("my-bucket", { prefix: "folder/subfolder/" })

// Upload / download / move / delete
await s3.upload("./local/file.pdf", "path/on/s3.pdf");
await s3.download("path/on/s3.pdf", "./local/file.pdf");
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

---

## DynamoDB ORM

Schema-validated, fully type-safe ORM backed by `zod` (v3 and v4 compatible).

```ts
import { AntokelAws, field } from "@antokel/cloud";
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
