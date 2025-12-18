# LMS Integration Roadmap

**Purpose**: Guide for integrating MegaCampusAI course generation with LMS platforms (Moodle, Canvas, OpenEdX, custom systems)

**Status**: Stage 1 - tRPC API ready for LMS integration
**Last Updated**: 2025-10-21

---

## Current Architecture (Stage 1)

### Single API: tRPC via HTTP

LMS systems can call MegaCampusAI API using standard HTTP POST requests:

```
┌─────────────────────────────────────────────┐
│         LMS System (PHP/Ruby/Python)        │
│                                             │
│  HTTP POST → tRPC endpoint                  │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│    MegaCampusAI Backend (tRPC API)          │
│                                             │
│  - POST /trpc/generation.initiate           │
│  - POST /trpc/generation.uploadFile         │
│  - POST /trpc/jobs.getStatus                │
│  - POST /trpc/jobs.cancel                   │
└─────────────────────────────────────────────┘
```

**Key Points**:
- tRPC endpoints are **standard HTTP POST** - no TypeScript required
- Any language can call: PHP, Ruby, Python, Java, Go, etc.
- Authentication: JWT Bearer tokens (Supabase Auth)
- Content-Type: `application/json`

---

## Stage 1: Direct tRPC Integration

### PHP Example (Moodle Plugin)

```php
<?php
/**
 * Moodle plugin to generate courses via MegaCampusAI
 */

class megacampus_api {
    private $api_url = 'https://api.megacampus.ai/trpc';
    private $jwt_token;

    public function __construct($jwt_token) {
        $this->jwt_token = $jwt_token;
    }

    /**
     * Initiate course generation
     */
    public function initiate_course_generation($course_uuid, $webhook_url = null) {
        $endpoint = $this->api_url . '/generation.initiate';

        $data = [
            'courseId' => $course_uuid,
            'webhookUrl' => $webhook_url
        ];

        $ch = curl_init($endpoint);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $this->jwt_token,
            'Content-Type: application/json'
        ]);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($http_code === 200) {
            return json_decode($response, true);
            // Returns: { success: true, jobId: "...", message: "...", courseId: "..." }
        } else if ($http_code === 429) {
            throw new Exception('Concurrency limit exceeded');
        } else {
            throw new Exception('API request failed: ' . $response);
        }
    }

    /**
     * Get job status
     */
    public function get_job_status($job_id) {
        $endpoint = $this->api_url . '/jobs.getStatus';

        $data = ['jobId' => $job_id];

        $ch = curl_init($endpoint);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $this->jwt_token,
            'Content-Type: application/json'
        ]);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

        $response = curl_exec($ch);
        curl_close($ch);

        return json_decode($response, true);
    }

    /**
     * Upload file for course generation
     */
    public function upload_file($course_id, $file_path) {
        $endpoint = $this->api_url . '/generation.uploadFile';

        $file_content = base64_encode(file_get_contents($file_path));
        $file_size = filesize($file_path);
        $mime_type = mime_content_type($file_path);
        $filename = basename($file_path);

        $data = [
            'courseId' => $course_id,
            'filename' => $filename,
            'fileSize' => $file_size,
            'mimeType' => $mime_type,
            'fileContent' => $file_content
        ];

        $ch = curl_init($endpoint);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $this->jwt_token,
            'Content-Type: application/json'
        ]);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

        $response = curl_exec($ch);
        return json_decode($response, true);
    }
}

// Usage example
$api = new megacampus_api($jwt_token);

try {
    // Create course in MegaCampusAI database first, get UUID
    $course_id = 'uuid-from-megacampus-db';

    // Optional: Upload syllabus
    $api->upload_file($course_id, '/path/to/syllabus.pdf');

    // Initiate generation
    $result = $api->initiate_course_generation(
        $course_id,
        'https://moodle.example.com/webhook/megacampus'
    );

    echo "Job started: " . $result['jobId'];

    // Poll status (or use webhook)
    while (true) {
        sleep(5);
        $status = $api->get_job_status($result['jobId']);
        echo "Progress: " . $status['progress']['percentage'] . "%\n";

        if ($status['status'] === 'completed') {
            echo "Course generated successfully!\n";
            break;
        } else if ($status['status'] === 'failed') {
            echo "Generation failed: " . $status['error']['message'] . "\n";
            break;
        }
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
```

### Python Example (Canvas LMS Integration)

```python
import requests
import base64
import time
from typing import Optional

class MegaCampusAPI:
    """
    Canvas LMS integration with MegaCampusAI
    """
    def __init__(self, jwt_token: str, api_url: str = 'https://api.megacampus.ai/trpc'):
        self.api_url = api_url
        self.headers = {
            'Authorization': f'Bearer {jwt_token}',
            'Content-Type': 'application/json'
        }

    def initiate_course_generation(self, course_id: str, webhook_url: Optional[str] = None):
        """Initiate course generation"""
        endpoint = f'{self.api_url}/generation.initiate'
        data = {
            'courseId': course_id,
            'webhookUrl': webhook_url
        }

        response = requests.post(endpoint, json=data, headers=self.headers)

        if response.status_code == 200:
            return response.json()
        elif response.status_code == 429:
            raise Exception('Concurrency limit exceeded')
        else:
            raise Exception(f'API request failed: {response.text}')

    def get_job_status(self, job_id: str):
        """Get job status"""
        endpoint = f'{self.api_url}/jobs.getStatus'
        data = {'jobId': job_id}

        response = requests.post(endpoint, json=data, headers=self.headers)
        return response.json()

    def upload_file(self, course_id: str, file_path: str):
        """Upload file for course generation"""
        endpoint = f'{self.api_url}/generation.uploadFile'

        with open(file_path, 'rb') as f:
            file_content = base64.b64encode(f.read()).decode('utf-8')

        import os
        import mimetypes

        file_size = os.path.getsize(file_path)
        mime_type, _ = mimetypes.guess_type(file_path)
        filename = os.path.basename(file_path)

        data = {
            'courseId': course_id,
            'filename': filename,
            'fileSize': file_size,
            'mimeType': mime_type or 'application/octet-stream',
            'fileContent': file_content
        }

        response = requests.post(endpoint, json=data, headers=self.headers)
        return response.json()

    def wait_for_completion(self, job_id: str, poll_interval: int = 5):
        """Poll job status until completion"""
        while True:
            status = self.get_job_status(job_id)

            print(f"Progress: {status['progress']['percentage']}%")

            if status['status'] == 'completed':
                print("Course generated successfully!")
                return status
            elif status['status'] == 'failed':
                raise Exception(f"Generation failed: {status['error']['message']}")

            time.sleep(poll_interval)

# Usage example
api = MegaCampusAPI(jwt_token='your-jwt-token')

# Create course in MegaCampusAI database, get UUID
course_id = 'uuid-from-megacampus-db'

# Upload syllabus (optional)
api.upload_file(course_id, '/path/to/syllabus.pdf')

# Initiate generation
result = api.initiate_course_generation(
    course_id,
    webhook_url='https://canvas.example.com/api/webhook/megacampus'
)

print(f"Job started: {result['jobId']}")

# Wait for completion
final_status = api.wait_for_completion(result['jobId'])
```

### Ruby Example (OpenEdX Integration)

```ruby
require 'net/http'
require 'json'
require 'base64'

class MegaCampusAPI
  def initialize(jwt_token, api_url = 'https://api.megacampus.ai/trpc')
    @api_url = api_url
    @jwt_token = jwt_token
  end

  def initiate_course_generation(course_id, webhook_url = nil)
    endpoint = "#{@api_url}/generation.initiate"
    data = {
      courseId: course_id,
      webhookUrl: webhook_url
    }

    response = post_request(endpoint, data)

    case response.code
    when '200'
      JSON.parse(response.body)
    when '429'
      raise 'Concurrency limit exceeded'
    else
      raise "API request failed: #{response.body}"
    end
  end

  def get_job_status(job_id)
    endpoint = "#{@api_url}/jobs.getStatus"
    data = { jobId: job_id }

    response = post_request(endpoint, data)
    JSON.parse(response.body)
  end

  def upload_file(course_id, file_path)
    endpoint = "#{@api_url}/generation.uploadFile"

    file_content = Base64.encode64(File.read(file_path))
    file_size = File.size(file_path)
    filename = File.basename(file_path)

    # Simplified MIME type detection
    mime_type = case File.extname(file_path)
                when '.pdf' then 'application/pdf'
                when '.docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                else 'application/octet-stream'
                end

    data = {
      courseId: course_id,
      filename: filename,
      fileSize: file_size,
      mimeType: mime_type,
      fileContent: file_content
    }

    response = post_request(endpoint, data)
    JSON.parse(response.body)
  end

  private

  def post_request(endpoint, data)
    uri = URI(endpoint)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == 'https')

    request = Net::HTTP::Post.new(uri.path)
    request['Authorization'] = "Bearer #{@jwt_token}"
    request['Content-Type'] = 'application/json'
    request.body = data.to_json

    http.request(request)
  end
end

# Usage example
api = MegaCampusAPI.new('your-jwt-token')

course_id = 'uuid-from-megacampus-db'

# Upload syllabus
api.upload_file(course_id, '/path/to/syllabus.pdf')

# Initiate generation
result = api.initiate_course_generation(
  course_id,
  'https://openedx.example.com/webhook/megacampus'
)

puts "Job started: #{result['jobId']}"

# Poll status
loop do
  sleep 5
  status = api.get_job_status(result['jobId'])
  puts "Progress: #{status['progress']['percentage']}%"

  if status['status'] == 'completed'
    puts 'Course generated successfully!'
    break
  elsif status['status'] == 'failed'
    puts "Generation failed: #{status['error']['message']}"
    break
  end
end
```

---

## Stage N: Optional REST Wrapper (Future)

**Trigger**: IF LMS partners request RESTful endpoints
**When**: Stage 3+ (after multiple LMS integrations validated)

### Why Wait?

- Current tRPC approach works for all languages via HTTP
- No duplication = less maintenance overhead
- Can validate LMS integration patterns first
- REST wrapper adds ~100 lines of thin proxy code

### Migration Path

If REST endpoints are requested, add thin Express wrapper:

```typescript
// packages/course-gen-platform/src/api/rest/index.ts
import express from 'express';
import { authenticateJWT } from './middleware/auth';
import { createTRPCClient } from '../trpc-client';

const app = express();
const trpc = createTRPCClient();

// REST → tRPC proxy
app.post('/api/v1/courses/:id/generate', authenticateJWT, async (req, res) => {
  try {
    const result = await trpc.generation.initiate.mutate({
      courseId: req.params.id,
      webhookUrl: req.body.webhookUrl
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/v1/jobs/:id', authenticateJWT, async (req, res) => {
  const result = await trpc.jobs.getStatus.query({ jobId: req.params.id });
  res.json(result);
});

export default app;
```

**Benefits**:
- RESTful paths: `GET /api/v1/jobs/123` instead of `POST /trpc/jobs.getStatus`
- OpenAPI/Swagger documentation auto-generation
- Follows REST conventions (GET/POST/PUT/DELETE)

**Overhead**:
- ~100 lines of proxy code
- Additional testing surface
- Dual API maintenance (tRPC + REST)

**Recommendation**: Wait for LMS partner feedback before implementing.

---

## Authentication Flow

### For LMS Systems

1. **User authenticates with Supabase**:
   ```javascript
   // LMS backend obtains JWT for service account
   const { data, error } = await supabase.auth.signInWithPassword({
     email: 'lms-service@example.com',
     password: 'service-account-password'
   });

   const jwt_token = data.session.access_token;
   ```

2. **LMS stores JWT** (refresh as needed, tokens expire after 1 hour)

3. **LMS calls MegaCampusAI API** with JWT Bearer token

### Security Considerations

- Use service accounts for LMS integrations (not user accounts)
- Refresh JWTs before expiration (1 hour default)
- Store JWTs securely (encrypted environment variables)
- Rotate service account passwords regularly
- Use RLS policies to restrict service account access

---

## Webhook Callbacks

LMS systems can provide webhook URLs to receive async updates:

```json
{
  "courseId": "uuid",
  "webhookUrl": "https://lms.example.com/api/webhook/megacampus"
}
```

**Webhook Payload** (sent when job completes):
```json
{
  "event": "course_generation_completed",
  "courseId": "uuid-v4",
  "jobId": "bullmq-job-123",
  "status": "completed",
  "timestamp": "2025-10-21T12:00:00Z",
  "progress": {
    "percentage": 100,
    "steps": [...]
  }
}
```

**LMS Webhook Handler** (PHP example):
```php
<?php
// Moodle webhook handler
function handle_megacampus_webhook() {
    $payload = json_decode(file_get_contents('php://input'), true);

    if ($payload['event'] === 'course_generation_completed') {
        $course_id = $payload['courseId'];

        // Fetch generated course content from MegaCampusAI
        // Import into Moodle
        import_generated_course($course_id);

        // Notify instructor
        send_notification($course_id, 'Course generation completed');
    }

    http_response_code(200);
    echo json_encode(['success' => true]);
}
?>
```

---

## API Endpoints Reference

### Available Now (Stage 1)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/trpc/generation.test` | POST | Health check (public, no auth) |
| `/trpc/generation.initiate` | POST | Start course generation |
| `/trpc/generation.uploadFile` | POST | Upload file for generation |
| `/trpc/jobs.getStatus` | POST | Get job status |
| `/trpc/jobs.cancel` | POST | Cancel running job |
| `/trpc/jobs.list` | POST | List user's jobs |

### Future (Stage N - Optional)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/v1/jobs/:id` | GET | Get job status (REST) |
| `POST /api/v1/courses/:id/generate` | POST | Start generation (REST) |
| `DELETE /api/v1/jobs/:id` | DELETE | Cancel job (REST) |
| `GET /api/v1/courses/:id/content` | GET | Fetch generated content (REST) |

---

## Migration Timeline

### Stage 1 (Current) - tRPC API
- ✅ LMS systems call tRPC via HTTP POST
- ✅ Documentation with PHP/Python/Ruby examples
- ✅ Works immediately, no implementation needed

### Stage 2 (After first LMS partner)
- Gather feedback on API usability
- Document common integration patterns
- Create official PHP/Python SDK if demand exists

### Stage 3 (If REST requested)
- Implement thin REST wrapper over tRPC
- Generate OpenAPI specification
- Auto-generate client SDKs for multiple languages

### Stage 4 (Advanced integrations)
- GraphQL endpoint (if requested)
- WebSocket support for real-time progress
- Batch operations API

---

## FAQ

**Q: Does tRPC require TypeScript on the LMS side?**
A: No. tRPC endpoints are standard HTTP POST. Any language works.

**Q: How do I authenticate?**
A: Use Supabase Auth to get JWT, pass as `Authorization: Bearer <token>` header.

**Q: Can I use REST instead of tRPC?**
A: Stage 1 uses tRPC (HTTP POST). REST wrapper can be added later if needed.

**Q: What about rate limiting?**
A: API has rate limits (10 requests/minute for generation.initiate). LMS should cache results.

**Q: How do I handle concurrency limits?**
A: API returns 429 status when tier limit hit. LMS should queue requests or upgrade tier.

**Q: Is there an official PHP SDK?**
A: Not yet. Stage 2 will create SDKs based on demand. Examples above are reference implementations.

---

## Contact

For LMS integration support:
- Email: integrations@megacampus.ai
- Docs: https://docs.megacampus.ai/lms-integration
- GitHub: https://github.com/megacampus/api-examples
