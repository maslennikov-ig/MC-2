import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';

const queue = new Queue('course-generation', {
  connection: { host: 'localhost', port: 6379 }
});

const files = [
  { id: '74e6e3d0-3410-4707-87ab-fecf02328a88', path: 'uploads/9b98a7d5-27ea-4441-81dc-de79d488e5db/b80647ce-4182-4bc7-8a21-19790c8ea54e/74e6e3d0-3410-4707-87ab-fecf02328a88.pdf', mime: 'application/pdf' },
  { id: '825b12f5-a195-4268-bb34-88ba604772ba', path: 'uploads/9b98a7d5-27ea-4441-81dc-de79d488e5db/b80647ce-4182-4bc7-8a21-19790c8ea54e/825b12f5-a195-4268-bb34-88ba604772ba.pdf', mime: 'application/pdf' },
  { id: 'dc537b7f-65a3-4836-9b28-73bc62defadc', path: 'uploads/9b98a7d5-27ea-4441-81dc-de79d488e5db/b80647ce-4182-4bc7-8a21-19790c8ea54e/dc537b7f-65a3-4836-9b28-73bc62defadc.pdf', mime: 'application/pdf' },
];

for (const file of files) {
  const jobData = {
    jobType: 'document_processing',
    organizationId: '9b98a7d5-27ea-4441-81dc-de79d488e5db',
    courseId: 'b80647ce-4182-4bc7-8a21-19790c8ea54e',
    userId: 'ca704da8-5522-4a39-9691-23f36b85d0ce',
    fileId: file.id,
    filePath: `/app/${file.path}`,
    mimeType: file.mime,
    chunkSize: 512,
    chunkOverlap: 50,
    createdAt: new Date().toISOString(),
  };
  
  const job = await queue.add('document_processing', jobData, { 
    jobId: randomUUID(),
    priority: 1 
  });
  console.log(`Job added for ${file.id}: ${job.id}`);
}

await queue.close();
process.exit(0);
