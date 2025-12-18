import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://diqooqbuchsliypgwksu.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const queue = new Queue('course-generation', {
  connection: { host: 'localhost', port: 6379 }
});

const courseId = 'b80647ce-4182-4bc7-8a21-19790c8ea54e';
const organizationId = '9b98a7d5-27ea-4441-81dc-de79d488e5db';
const userId = 'ca704da8-5522-4a39-9691-23f36b85d0ce';

const failedPdfs = [
  { id: '74e6e3d0-3410-4707-87ab-fecf02328a88', path: `uploads/${organizationId}/${courseId}/74e6e3d0-3410-4707-87ab-fecf02328a88.pdf`, mime: 'application/pdf' },
  { id: '825b12f5-a195-4268-bb34-88ba604772ba', path: `uploads/${organizationId}/${courseId}/825b12f5-a195-4268-bb34-88ba604772ba.pdf`, mime: 'application/pdf' },
  { id: 'dc537b7f-65a3-4836-9b28-73bc62defadc', path: `uploads/${organizationId}/${courseId}/dc537b7f-65a3-4836-9b28-73bc62defadc.pdf`, mime: 'application/pdf' },
];

console.log('Step 1: Resetting file_catalog status to pending...');

// Reset status in database
const { error: resetError } = await supabase
  .from('file_catalog')
  .update({
    vector_status: 'pending',
    error_message: null
  })
  .in('id', failedPdfs.map(f => f.id));

if (resetError) {
  console.error('Failed to reset file statuses:', resetError);
  process.exit(1);
}

console.log('Step 2: Adding jobs to queue...');

for (const file of failedPdfs) {
  const jobData = {
    jobType: 'document_processing',
    organizationId,
    courseId,
    userId,
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

console.log('Step 3: Done! Start the worker to process the jobs.');

await queue.close();
process.exit(0);
