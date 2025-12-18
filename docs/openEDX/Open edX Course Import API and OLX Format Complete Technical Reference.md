# Open edX Course Import API and OLX Format: Complete Technical Reference

Programmatic course upload to Open edX Redwood (2024) requires two components: the **REST API** at `/api/courses/v0/import/{course_key}/` for uploading tar.gz packages, and **OLX (Open Learning XML)** for structuring course content. This guide provides working code examples, exact XML schemas, and solutions to common validation errors—everything needed to build automated course pipelines.

## REST API endpoint accepts multipart tar.gz uploads

The Course Import API lives on the **CMS/Studio server** (not LMS) and has been stable since the Ginkgo release (2017). The endpoint handles asynchronous imports with task polling.

**Endpoint Details:**

| Property | Value |
|----------|-------|
| **URL Pattern** | `/api/courses/v0/import/{course_key}/` |
| **Host** | CMS/Studio server (port 18010 in dev, `studio.yourdomain.com` in production) |
| **POST** | Upload tar.gz file, returns `task_id` |
| **GET** | Check status with `?task_id=` parameter |
| **Course Key Format** | `course-v1:Org+Course+Run` (e.g., `course-v1:edX+DemoX+Demo_Course`) |

**Authentication uses JWT tokens via OAuth2 Client Credentials flow.** Create an OAuth2 Application in Django Admin at `/admin/oauth2_provider/application/` with Client Type "Confidential" and Grant Type "Client Credentials." The authorization header format is `Authorization: JWT <token>` (not Bearer).

**Request format** is `multipart/form-data` with a single required field `course_data` containing the tar.gz file. The response returns `{"task_id": "uuid"}` for polling.

**Status values** returned by GET requests: `Pending`, `In Progress`, `Succeeded`, or `Failed`.

**Required permissions:** User must have `has_studio_write_access` for the specific course—either global staff (`is_staff=True`) or Course Staff/Instructor role.

## Complete Python implementation for course import

```python
import base64
import time
import requests

class OpenEdXCourseImporter:
    def __init__(self, lms_url, cms_url, client_id, client_secret):
        self.lms_url = lms_url.rstrip('/')
        self.cms_url = cms_url.rstrip('/')
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = None
    
    def authenticate(self):
        """Get JWT access token from LMS."""
        credential = f"{self.client_id}:{self.client_secret}"
        encoded = base64.b64encode(credential.encode()).decode()
        
        response = requests.post(
            f"{self.lms_url}/oauth2/access_token",
            headers={
                "Authorization": f"Basic {encoded}",
                "Cache-Control": "no-cache"
            },
            data={
                "grant_type": "client_credentials",
                "token_type": "jwt"
            }
        )
        response.raise_for_status()
        self.access_token = response.json()["access_token"]
        return self.access_token
    
    def import_course(self, course_key, tar_gz_path, timeout=300):
        """Upload course and poll until completion."""
        if not self.access_token:
            self.authenticate()
        
        headers = {"Authorization": f"JWT {self.access_token}"}
        url = f"{self.cms_url}/api/courses/v0/import/{course_key}/"
        
        # Upload tar.gz
        with open(tar_gz_path, 'rb') as f:
            response = requests.post(
                url,
                files={'course_data': (tar_gz_path, f, 'application/gzip')},
                headers=headers
            )
        response.raise_for_status()
        task_id = response.json()['task_id']
        print(f"Import started: {task_id}")
        
        # Poll for completion
        start = time.time()
        while time.time() - start < timeout:
            status_response = requests.get(
                url,
                params={"task_id": task_id},
                headers=headers
            )
            state = status_response.json()["state"]
            print(f"Status: {state}")
            
            if state == "Succeeded":
                return True
            elif state == "Failed":
                raise Exception("Course import failed")
            time.sleep(5)
        
        raise TimeoutError("Import timed out")

# Usage
importer = OpenEdXCourseImporter(
    lms_url="https://lms.example.com",
    cms_url="https://studio.example.com",
    client_id="your_client_id",
    client_secret="your_client_secret"
)
importer.import_course("course-v1:MyOrg+CS101+2024", "./course.tar.gz")
```

**curl equivalent for quick testing:**
```bash
# Get token
curl -X POST -d "grant_type=client_credentials&client_id=ID&client_secret=SECRET&token_type=jwt" \
  https://lms.example.com/oauth2/access_token

# Upload course
curl -X POST \
  -H "Authorization: JWT YOUR_TOKEN" \
  -F "course_data=@course.tar.gz" \
  https://studio.example.com/api/courses/v0/import/course-v1:Org+Course+Run/
```

## OLX uses custom XML without formal namespaces

**OLX does not use XML namespaces or XSD schemas.** The format uses custom elements with attributes—the Open edX project acknowledges the specification is loosely defined. The hierarchy is strict: **Course → Chapter → Sequential → Vertical → Components**.

### Minimal valid OLX package structure

```
my-course/
├── course.xml                    # REQUIRED: Root file
├── chapter/
│   └── week1.xml
├── sequential/
│   └── lesson1.xml
├── vertical/
│   └── unit1.xml
├── html/
│   ├── intro.xml
│   └── intro.html               # Actual HTML content
├── problem/
│   └── quiz1.xml
├── policies/
│   └── 2024/                    # Must match course url_name
│       ├── policy.json
│       └── grading_policy.json
└── static/                      # Images, PDFs, etc.
```

### course.xml (root file)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<course 
    org="MyOrg" 
    course="CS101" 
    url_name="2024"
    display_name="Introduction to Computer Science"
    start="2024-01-01T00:00:00Z"
    enrollment_start="2023-12-01T00:00:00Z">
    
    <chapter url_name="week1"/>
    <chapter url_name="week2"/>
</course>
```

**Required attributes:** `org`, `course`, `url_name`. Optional: `display_name`, `start`, `end`, `enrollment_start`, `enrollment_end`, `course_image`, `language`.

### chapter (sections)

```xml
<!-- chapter/week1.xml -->
<chapter display_name="Week 1: Getting Started">
    <sequential url_name="lesson1"/>
    <sequential url_name="lesson2"/>
</chapter>
```

### sequential (subsections)

```xml
<!-- sequential/lesson1.xml -->
<sequential 
    display_name="Introduction to Programming"
    graded="true"
    format="Homework"
    due="2024-02-15T23:59:00Z">
    
    <vertical url_name="unit1"/>
    <vertical url_name="unit2"/>
</sequential>
```

The `format` attribute must match an assignment type in `grading_policy.json`.

### vertical (units)

```xml
<!-- vertical/unit1.xml -->
<vertical display_name="Welcome Unit">
    <html url_name="intro"/>
    <video url_name="welcome_video"/>
    <problem url_name="quiz1"/>
</vertical>
```

### html (content blocks)

**Recommended approach—separate XML and HTML files:**

```xml
<!-- html/intro.xml -->
<html display_name="Welcome" filename="intro"/>
```

```html
<!-- html/intro.html -->
<h2>Welcome to the Course!</h2>
<p>This is your first unit. You'll learn the fundamentals.</p>
<p>Content supports <strong>full UTF-8</strong> including Cyrillic: Привет мир!</p>
```

**Inline alternative (for simple content):**
```xml
<html display_name="Quick Note" url_name="note1">
    <p>Short inline content works here.</p>
</html>
```

### problem (assessments)

```xml
<!-- problem/quiz1.xml -->
<problem display_name="Check Your Understanding" max_attempts="3">
    <multiplechoiceresponse>
        <label>What is the output of print(2 + 2)?</label>
        <choicegroup type="MultipleChoice">
            <choice correct="false">3</choice>
            <choice correct="true">4</choice>
            <choice correct="false">"22"</choice>
        </choicegroup>
    </multiplechoiceresponse>
</problem>
```

## url_name rules prevent the most common import failures

The `url_name` attribute is critical—it uniquely identifies every content block and maps to file names.

**Character restrictions:** Only `a-z`, `A-Z`, `0-9`, underscore (`_`), and hyphen (`-`). **No spaces, special characters, or non-ASCII.** Valid: `week_1`, `intro-video`, `quiz2a`. Invalid: `week 1`, `введение`, `quiz#1`.

**Uniqueness requirement:** Must be unique within each element type. You can have both `html/intro.xml` and `problem/intro.xml`, but not two `html/intro.xml`.

**File mapping:** `<html url_name="intro"/>` resolves to `html/intro.xml`.

## Policies directory configures grading

```json
// policies/2024/grading_policy.json
{
    "GRADER": [
        {
            "type": "Homework",
            "short_label": "HW",
            "min_count": 5,
            "drop_count": 1,
            "weight": 0.5
        },
        {
            "type": "Final Exam",
            "short_label": "Final",
            "min_count": 1,
            "drop_count": 0,
            "weight": 0.5
        }
    ],
    "GRADE_CUTOFFS": {
        "Pass": 0.6
    }
}
```

**All weights must sum to 1.0.** The `type` values must match `format` attributes in sequential elements.

```json
// policies/2024/policy.json
{
    "course/2024": {
        "display_name": "CS 101",
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-12-31T23:59:59Z",
        "cert_html_view_enabled": true
    }
}
```

## Common validation errors and solutions

| Error | Cause | Solution |
|-------|-------|----------|
| **DuplicateURLName** | Same url_name used twice | Use unique identifiers |
| **InvalidURLName** | Spaces or special characters | Use only a-z, 0-9, _, - |
| **MissingFile** | url_name doesn't match filename | Ensure `url_name="intro"` → `html/intro.xml` |
| **VerifyRootName** | No course.xml at root | Rename or add course.xml |
| **UnsafeTarFile** | Absolute paths in archive | Rebuild with relative paths only |
| **XMLSyntaxError** | Malformed XML | Validate with xmllint |
| **InvalidGradeWeight** | Weights don't sum to 1.0 | Adjust grading_policy.json |
| **Unknown block type** | XBlock not installed | Check platform configuration |

**API error codes:** `401` (authentication failed), `403` (no course access), `404` (course doesn't exist).

## Creating the tar.gz package programmatically

```python
import tarfile
from pathlib import Path

def create_olx_package(course_dir, output_path):
    """Package OLX directory as tar.gz."""
    course_path = Path(course_dir)
    
    if not (course_path / "course.xml").exists():
        raise ValueError("course.xml not found")
    
    with tarfile.open(output_path, "w:gz") as tar:
        tar.add(course_path, arcname=course_path.name)
    
    return output_path

# Creates my-course.tar.gz with my-course/ as root
create_olx_package("./my-course", "my-course.tar.gz")
```

**Important:** The tar.gz must contain a directory (not files at root level), and that directory must contain `course.xml`.

## Tutor deployment specifics

For Tutor-based Open edX installations:

**Create OAuth2 app via shell:**
```bash
tutor local run lms ./manage.py lms shell

# In Python shell:
from oauth2_provider.models import Application
from django.contrib.auth import get_user_model
user = get_user_model().objects.get(username='admin')
app = Application.objects.create(
    user=user,
    name='Course Importer',
    client_type='confidential',
    authorization_grant_type='client-credentials'
)
print(f"Client ID: {app.client_id}")
print(f"Secret: {app.client_secret}")
```

**Alternative import via management command:**
```bash
tutor local run --volume=/path/to/courses:/data \
    cms ./manage.py cms import /data/my-course/
```

## Redwood-specific considerations

The **Learning MFE (Micro-Frontend)** in Redwood enforces strict hierarchy—deprecated elements like `problemset` and `videosequence` no longer render. Always use the standard Course → Chapter → Sequential → Vertical → Components structure.

The official [openedx-demo-course](https://github.com/openedx/openedx-demo-course) repository contains `dist/demo-course.tar.gz`—a complete reference implementation updated for Redwood.

## Conclusion

Successful programmatic course import requires: **(1)** properly structured OLX with unique ASCII-only url_names, **(2)** valid tar.gz packaging with course.xml at the expected path, and **(3)** JWT authentication against the CMS endpoint. The most common failures stem from url_name collisions, missing files, and grading policy weight mismatches. Use the olxcleaner tool (`pip install olxcleaner`) to validate packages before upload, and reference the demo course repository for edge cases in component structure.