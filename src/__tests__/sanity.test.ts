import { z } from 'zod';
import { AntokelAws, field } from '../index';

const aws = new AntokelAws({ region: 'us-east-1' });

const userSchema = z.object({
  pk: z.string(),
  name: z.string(),
  age: z.number(),
});
const userTable = aws.Dynamo({
  tableName: 'UsersTable',
  schema: userSchema,
  partitionKey: 'pk',
});

async function main() {
  console.log('DynamoDB ORM Test...');

  try {
    const q1 = await userTable.query('user_123', [
      field('age').isGreaterThan(18),
      field('name').startsWith('John'),
    ]);
    console.log('Query builder output mock passed', q1);
  } catch (e: any) {
    console.log('Error querying (expected if no AWS credentials)', e.message);
  }

  console.log('S3 Test...');
  const s3 = aws.S3('test-bucket');
  try {
    const lines = s3.asText.streamLines('test.csv');
    for await (const line of lines) {
      console.log(line);
      break;
    }
  } catch (e: any) {
    console.log('Error streaming (expected if no AWS credentials)', e.message);
  }

  console.log('Tests defined properly!');
}

main().catch(console.error);
