import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://diqooqbuchsliypgwksu.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const queue = new Queue('course-generation', {
  connection: { host: 'localhost', port: 6379 }
});

// The single failed PDF to requeue
const fileId = '74e6e3d0-3410-4707-87ab-fecf02328a88';
const courseId = 'b80647ce-4182-4bc7-8a21-19790c8ea54e';
const organizationId = '9b98a7d5-27ea-4441-81dc-de79d488e5db';
const userId = 'ca704da8-5522-4a39-9691-23f36b85d0ce';

// Reset status in database
console.log('Resetting file status...');
const { error: resetError } = await supabase
  .from('file_catalog')
  .update({ vector_status: 'pending', error_message: null })
  .eq('id', fileId);

if (resetError) {
  console.error('Failed to reset status:', resetError);
  process.exit(1);
}

console.log('Status reset to pending');

// Add job to queue
const jobData = {
  jobType: 'document_processing',
  organizationId,
  courseId,
  userId,
  fileId,
  filePath: `/app/uploads/${organizationId}/${courseId}/${fileId}.pdf`,
  mimeType: 'application/pdf',
  chunkSize: 512,
  chunkOverlap: 50,
  createdAt: new Date().toISOString(),
};

const job = await queue.add('document_processing', jobData, {
  jobId: randomUUID(),
  priority: 1
});

console.log('Job added to queue:', job.id);
console.log('File ID:', fileId);

await queue.close();
console.log('Done!');
