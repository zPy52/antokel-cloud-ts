# DynamoDB

## Overview

Use `aws.Dynamo(...)` for a zod-backed, type-safe DynamoDB ORM. The README defines the public workflow: declare a zod schema, create a table binding, then use CRUD, query, and scan methods with `field(...)` filter helpers.

## Setup Pattern

```ts
import { AntokelAws, field } from "antokel-cloud";
import { z } from "zod";

const aws = new AntokelAws({ region: "us-east-1" });

const userSchema = z.object({
  pk: z.string(),
  sk: z.string(),
  username: z.string(),
  age: z.number(),
  tags: z.array(z.string()).optional(),
});

const users = aws.Dynamo({
  tableName: "UsersTable",
  schema: userSchema,
  partitionKey: "pk",
  sortKey: "sk",
});
```

## Common Tasks

### Create or Replace an Item

```ts
await users.put({
  pk: "user#123",
  sk: "profile",
  username: "Alice",
  age: 30,
});
```

Use `put` when the user wants schema-validated writes.

### Read a Single Item

```ts
const user = await users.get("user#123", "profile");
```

The README states this returns `z.infer<typeof userSchema> | null`. Preserve that typed expectation when explaining or generating code.

### Delete an Item

```ts
await users.delete("user#123", "profile");
```

### Query with Filters

```ts
const { items } = await users.query(
  "user#123",
  [
    field("age").isGreaterThan(18),
    field("username").startsWith("Ali"),
    field("tags").contains("admin"),
  ],
  { limit: 50, scanIndexForward: false }
);
```

Use `query(partitionKeyValue, filters, options?)` when the user already knows the partition key and wants filtered results.

### Scan with Filters

```ts
const { items: allAdmins } = await users.scan([
  field("tags").contains("admin"),
  field("age").isBetween(25, 40),
]);
```

Use `scan(...)` for full-table filtering when the task is not keyed by a known partition value.

## `field(...)` Operators

The README documents these operators:

- `isEqualTo(v)`
- `isLessThan(v)`
- `isLessThanOrEqualTo(v)`
- `isGreaterThan(v)`
- `isGreaterThanOrEqualTo(v)`
- `isBetween(a, b)`
- `isAnyOf([...])`
- `contains(v)`
- `startsWith(v)`
- `exists()`
- `notExists()`
- `hasType("S")`

Use these exact names in examples and reviews.

## Important Caveats

- Keep examples zod-based. The README explicitly positions the ORM as schema-validated and compatible with zod v3 and v4.
- Do not claim undocumented mutation helpers such as partial update builders unless the user provides separate source requirements.
- Preserve the documented argument order for `get`, `delete`, `query`, and `scan`.

## Request Mapping

- “Create a typed table wrapper” -> `aws.Dynamo({ tableName, schema, partitionKey, sortKey })`
- “Insert an item” -> `put(...)`
- “Fetch one record” -> `get(pk, sk)`
- “Delete one record” -> `delete(pk, sk)`
- “Query by partition key with extra conditions” -> `query(pkValue, [field(...)...], options)`
- “Scan for matching records” -> `scan([field(...)...])`
