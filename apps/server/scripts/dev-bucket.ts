/** Создаёт bucket из S3_BUCKET, если его нет (локальный MinIO). */
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { bucket, s3 } from "../src/storage/s3.js";

const name = bucket();
try {
  await s3().send(new HeadBucketCommand({ Bucket: name }));
  console.log(`bucket ${name} уже есть`);
} catch {
  await s3().send(new CreateBucketCommand({ Bucket: name }));
  console.log(`bucket ${name} создан`);
}
