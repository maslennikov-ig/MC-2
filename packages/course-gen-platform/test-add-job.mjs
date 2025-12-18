import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';

const queue = new Queue('course-generation', {
  connection: {
    host: 'localhost',
    port: 6379,
  }
});

const jobData = {
  jobType: 'document_processing',
  organizationId: '9b98a7d5-27ea-4441-81dc-de79d488e5db',
  courseId: 'b80647ce-4182-4bc7-8a21-19790c8ea54e',
  userId: 'ca704da8-5522-4a39-9691-23f36b85d0ce',
  fileId: 'f8a3a765-094e-477d-8f08-1d2bd81216aa',
  filePath: '/app/uploads/9b98a7d5-27ea-4441-81dc-de79d488e5db/b80647ce-4182-4bc7-8a21-19790c8ea54e/f8a3a765-094e-477d-8f08-1d2bd81216aa.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  chunkSize: 512,
  chunkOverlap: 50,
  createdAt: new Date().toISOString(),
};

console.log('Adding job with name: document_processing');
console.log('filePath:', jobData.filePath);

const job = await queue.add('document_processing', jobData, { 
  jobId: randomUUID(),
  priority: 1 
});
console.log('Job added:', job.id);
await queue.close();
process.exit(0);
