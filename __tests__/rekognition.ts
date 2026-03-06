import { AntokelAws } from '../src';

const aws = new AntokelAws();
const rekog = aws.Rekognition();

async function test() {
  const labelsRes = await rekog.labels('https://example.com/image.jpg');
  console.log(labelsRes.toJson());
  
  const faceRes = await rekog.facial(Buffer.from([]));
  console.log(faceRes.toJson());
}
