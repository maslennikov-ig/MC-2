# **Technical Specification and Implementation Guide for Open edX Redwood Course Import Architecture and OLX Standards**

## **1\. Executive Summary and Architectural Overview**

The evolution of the Open edX platform, particularly with the "Redwood" release (June 2024), signifies a continued commitment to robust, scalable, and modular education technology. For institutional adopters, systems integrators, and course engineers, the ability to programmatically manage course content is a cornerstone requirement. While the platform provides a rich user interface through the Studio (CMS) application for manual content creation, large-scale operations—such as migrating legacy archives, synchronizing with external content management systems, or deploying localized courseware across multiple instances—necessitate a reliable, automated ingestion pipeline.

This report provides an exhaustive technical analysis of the mechanisms available for programmatic course import within the Open edX Redwood ecosystem. It dissects the primary architectural interface for this task: the Course Import REST API. Furthermore, it details the data standard required by this API: the Open Learning XML (OLX) format. The analysis highlights that while the frontend of Open edX shifts toward Micro-Frontends (MFEs) and React-based interfaces, the backend mechanisms for bulk content ingestion remain rooted in stable, Django-based API endpoints that interface asynchronously with the platform’s underlying modulestore.

The import process in Open edX is not a simple synchronous file upload; it is a complex orchestration of authentication, validation, asynchronous task processing, and database serialization. The API endpoint POST /api/courses/v0/import/{course\_id}/ serves as the entry point, triggering a background Celery task that parses a compressed tarball (.tar.gz) containing the OLX structure. This architecture ensures that resource-intensive parsing operations do not block the web server’s request-response cycle, maintaining platform stability even during the ingestion of massive media-rich courses.

A critical dimension of this report is the handling of internationalization, specifically the support for Cyrillic (and other non-ASCII) characters. The Open edX platform enforces strict separation between internal identifiers (url\_name), which must adhere to ASCII-based slug patterns, and display fields (display\_name, content bodies), which fully support UTF-8. Misunderstanding this distinction is a primary source of failure in automated migration projects involving non-English content. This document serves as a definitive reference for navigating these constraints, offering precise specifications for namespace declarations, XBlock families, and the requisite directory structures for a successful import.

## **2\. Platform Architecture: CMS, Modulestore, and Async Processing**

To effectively utilize the Course Import API, one must first comprehend the architectural context of the Open edX CMS application. The Content Management System (CMS), often referred to as Studio, is distinct from the Learning Management System (LMS). The CMS is responsible for the authoring, structuring, and publishing of courseware.

### **2.1 The Split Mongo Modulestore**

At the persistence layer, Open edX utilizes an abstraction known as the modulestore. In the Redwood release, the default implementation is the **Split Mongo Modulestore**. Unlike relational database models that might store course content in rigid SQL tables, the Modulestore is designed to handle hierarchical, tree-structured data inherent to learning paths (Courses \> Chapters \> Sequentials \> Verticals \> Components).

The "Split" nature of this store refers to its ability to separate the course structure (the definition of the tree) from the course content (the fields within the blocks) and the course versions (draft vs. published). When a client utilizes the Course Import API, they are effectively pushing a serialized representation of this tree (via OLX) into the Modulestore. The import process parses the XML, validates the schema, and writes the objects into MongoDB collections. This ensures that content imported programmatically is immediately editable within the Studio UI and, once published, viewable in the LMS.1

### **2.2 The Asynchronous Pipeline (Celery)**

A fundamental characteristic of the course import architecture is its asynchronous nature. Processing a course tarball involves unzipping files, parsing XML, validating references, updating asset metadata, and writing potentially thousands of documents to the database. Performing this synchronously within an HTTP request would invariably lead to timeouts and server instability.

Therefore, the Open edX architecture employs **Celery**, a distributed task queue, to handle imports.

1. **Request Initiation:** The API client sends a POST request with the file.  
2. **Task Queuing:** The Django view validates the user's permissions and the request format, saves the uploaded file to a temporary storage location, and queues an import\_course task in Celery.  
3. **Immediate Acknowledgement:** The server responds immediately with a HTTP 200 OK status and a unique task\_id.  
4. **Background Execution:** A Celery worker picks up the task, performs the heavy lifting, and updates the task status.  
5. **Completion:** The client must poll for the status of this task to confirm success or receive error details.

This pattern dictates that any client application designed to automate imports must implement polling logic, robust timeout handling, and state management.3

## **3\. Authentication and Security Framework**

Security is paramount for the Import API, as the ability to overwrite course content carries significant operational risk. The Open edX platform offers multiple authentication mechanisms, but for programmatic access in the Redwood release, OAuth2 is the standard.

### **3.1 OAuth2 Client Credentials Flow**

For server-to-server communication or automated scripts, the **Client Credentials** grant type is the most appropriate method. This allows a script to authenticate as a registered application (service client) without requiring manual user login steps.5

**Setup Process:**

1. **Application Registration:** A platform administrator must access the Django Admin panel (/admin/oauth2\_provider/application/) to register a new application.  
2. **Configuration:**  
   * **Client Type:** Confidential.  
   * **Authorization Grant Type:** Client Credentials.  
   * **User:** A valid platform user (often a dedicated service user) must be associated with the application. This user's permissions will determine what the API can do.  
3. **Credential Generation:** The system generates a client\_id and client\_secret.

Token Retrieval:  
The client exchanges these credentials for a JSON Web Token (JWT).

HTTP

POST /oauth2/access\_token  
Host: lms.your-instance.com  
Content-Type: application/x-www-form-urlencoded

grant\_type=client\_credentials\&client\_id={CLIENT\_ID}\&client\_secret={CLIENT\_SECRET}\&token\_type=jwt

**Response:**

JSON

{  
    "access\_token": "eyJhbGciOiJIUzI1NiIsIn...",  
    "expires\_in": 36000,  
    "token\_type": "Bearer",  
    "scope": "read write"  
}

The returned access\_token is a signed JWT that encodes the identity of the user associated with the OAuth application. This token must be included in the Authorization header of subsequent API requests.5

### **3.2 Session Authentication and CSRF**

While OAuth2 is preferred for scripts, developers may also interact with the API using session-based authentication (e.g., via browser automation or legacy scripts). In this context, **Cross-Site Request Forgery (CSRF)** protection is strictly enforced.

The client must:

1. Login to the Studio sign-in page to establish a session.  
2. Extract the csrftoken cookie.  
3. Include this token in the X-CSRFToken HTTP header for the POST request.  
4. Ensure the Referer header is set to the Studio origin, as Django's strict CSRF middleware validates this for HTTPS connections.6

### **3.3 Permissions Model**

Possessing a valid token is necessary but not sufficient; the authenticated user must also have specific permissions.

* **Is Staff:** A user with the global is\_staff flag can typically import into any course.  
* **Course Creator:** To import a new course (creating it from scratch), the user needs Course Creator status in the system.  
* **Course Team Member:** To import into an existing course, the user must be enrolled in that course's team with Admin or Staff access.  
* **Organization Access:** If the instance uses multi-tenancy or organization-specific restrictions, the user must be associated with the organization defined in the course ID (e.g., org="MITx").

A common failure mode (HTTP 403 Forbidden) occurs when a service user created for the API has not been explicitly added to the instructor team of the target course.5

## **4\. The Course Import REST API Specification**

The core interface for programmatic content ingestion is the CourseImportView. This endpoint allows for the complete replacement of a course's content with the data provided in a .tar.gz payload.

### **4.1 Endpoint Details**

| Attribute | Specification |
| :---- | :---- |
| **URL Pattern** | https://{studio\_host}/api/courses/v0/import/{course\_id}/ |
| **HTTP Method** | POST |
| **Content-Type** | multipart/form-data |
| **Authentication** | OAuth2 Bearer Token / Session Cookie |
| **Code Reference** | cms/djangoapps/contentstore/api/views/course\_import.py |

**Parameter Breakdown:**

* **{studio\_host}**: The domain of the CMS (e.g., studio.edx.org or studio.my-university.edu).  
* **{course\_id}**: The opaque key string identifying the course. This must follow the pattern course-v1:Org+Number+Run.  
  * Example: course-v1:UniversityX+CS101+2024\_T1.  
  * Note: While older versions supported "Slash-separated" IDs (Org/Course/Run), the Redwood release and all modern versions strongly favor the course-v1: format.4

### **4.2 Request Construction**

The request body must be formatted as multipart/form-data. This is essential because the payload is a binary file.

**Fields:**

* **course\_data** (Required): The file object. The key name must be exactly course\_data. The filename should end in .tar.gz.  
* **course\_id** (Implicit/Explicit): While the ID is in the URL, some legacy wrappers or internal calls might expect it in the body, but for the REST API, the URL parameter is the routing mechanism.4

**Example HTTP Request (Conceptual):**

HTTP

POST /api/courses/v0/import/course-v1:edX+DemoX+2024/ HTTP/1.1  
Host: studio.example.com  
Authorization: JWT \<access\_token\>  
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

\------WebKitFormBoundary7MA4YWxkTrZu0gW  
Content-Disposition: form\-data; name\="course\_data"; filename="course\_export.tar.gz"  
Content-Type: application/x-gzip

\<Binary Data...\>  
\------WebKitFormBoundary7MA4YWxkTrZu0gW--

### **4.3 The "Overwrite" Paradigm**

It is crucial to understand that the Course Import API is **destructive**. It functions as a complete state replacement for the course content defined in the XML.

* **Replacement Scope:** If the tarball contains a full course definition (Chapters, Sequentials, Verticals), the import process will align the course structure to match the XML.  
* **Orphaned Content:** Content in the database that is *not* referenced in the imported XML structure may be orphaned or deleted, depending on the depth of the import.  
* **Recommendation:** The standard operating procedure for programmatic updates is to **Export** the current course first (to create a backup artifact), modify the XML locally or generate a new package, and then **Import** the result. This ensures that no accidental data loss occurs.9

### **4.4 Status Polling and Response Handling**

Upon a successful POST, the server acknowledges the receipt of the file.

**Success Response (Immediate):**

JSON

{  
    "Import\_status": 1,  
    "Task\_id": "c56c8400-e29b-41d4-a716-446655440000"  
}

* **Import\_status**: A generic indicator that the request was accepted.  
* **Task\_id**: The UUID of the Celery task.

Polling Endpoint:  
To determine the actual result, the client must query the status endpoint using the task\_id.4

* **URL:** GET /api/courses/v0/import/{course\_id}/?task\_id={task\_id}  
* **Response:**  
  JSON  
  {  
      "state": "SUCCESS",  
      "result": "Import successful"  
  }

  Possible states include PENDING, STARTED, RETRY, FAILURE, and SUCCESS.

Error Handling:  
If the state is FAILURE, the response usually includes a result field with a traceback or error message. Common errors include:

* UnpackingError: The file provided was not a valid gzip archive or was corrupted during transmission.11  
* InvalidTabsException: The course.xml defines tabs (e.g., Discussion, Wiki) that conflict with system defaults or are malformed.12  
* ItemNotFoundError: The XML references a file (e.g., \<html filename="lab1"\>) that does not exist in the tarball.12

## **5\. Open Learning XML (OLX) Comprehensive Specification**

The success of an import depends entirely on the validity of the Open Learning XML (OLX) payload. OLX is a file-based representation of the course that Open edX parses to populate the Modulestore.

### **5.1 Package and Directory Structure**

The structure of the .tar.gz archive is rigid. It must contain a single top-level directory (typically named after the course url\_name). Inside this directory lies the course.xml file and the subdirectories for components.

Standard Directory Layout:  
my\_course\_tarball.tar.gz  
└── 2024\_Course\_Run/ \<-- Top-level directory  
├── course.xml \<-- Entry point  
├── about/ \<-- Overview and marketing content  
│ ├── overview.html  
│ └── short\_description.html  
├── assets/ \<-- Asset metadata  
│ └── assets.xml  
├── chapter/ \<-- Sections  
│ ├── section\_1.xml  
│ └── section\_2.xml  
├── sequential/ \<-- Subsections  
│ ├── subsection\_1.xml  
│ └── subsection\_2.xml  
├── vertical/ \<-- Units  
│ ├── unit\_1.xml  
│ └── unit\_2.xml  
├── html/ \<-- HTML Components  
│ └── intro\_text.html  
│ └── intro\_text.xml  
├── problem/ \<-- Problem Components  
│ └── quiz\_1.xml  
├── policies/ \<-- Course Settings  
│ ├── assets.json  
│ └── course\_settings.json  
└── static/ \<-- Raw static files (images, PDFs)  
└── image.png  
**Critical Constraint:** The import process will fail if the tarball contains loose files at the root (i.e., course.xml is not inside a directory) or if the top-level directory name does not match expectations derived from the course run, although modern importers are somewhat resilient to the directory name itself as long as the internal structure is valid.10

### **5.2 The course.xml Manifesto**

The course.xml file acts as the router for the course. It links the abstract course object to its constituent chapters.

**Example Schema:**

XML

\<course  
    url\_name\="2024\_Spring"  
    org\="TechUniversity"  
    course\="CS101"  
    display\_name\="Introduction to Computer Science"  
    start\="2024-01-01T00:00:00Z"  
    enrollment\_start\="2023-12-01T00:00:00Z"  
    enrollment\_end\="2024-02-01T00:00:00Z"  
    language\="en"  
    advanced\_modules\="\["poll", "lti\_consumer"\]"  
\>  
    \<chapter url\_name\="introduction\_section" /\>  
    \<chapter url\_name\="advanced\_concepts" /\>  
\</course\>

**Attribute Definition:**

* **url\_name**: The unique identifier for this course run within the XML structure. It must be ASCII.  
* **org**: The organization namespace (e.g., edX, MITx).  
* **course**: The catalog number (e.g., CS101).  
* **display\_name**: The title visible to learners. This supports UTF-8 (Cyrillic).  
* **advanced\_modules**: A JSON-encoded string list of "Advanced Settings" modules (XBlocks) enabled for this course. If a component (like a Poll) is used in a vertical but not declared here, the import may succeed, but the component will fail to render in the LMS.14

### **5.3 Namespace Declarations**

In the context of XML parsing, OLX is relatively permissive. It does not strictly require an xmlns declaration at the root of every file for standard components. However, specific XBlocks or integrations may utilize namespaces or pseudo-namespaces to identify their type.

Standard XML Namespace:  
Documentation suggests that while parsing is often namespace-agnostic for core components, valid XML headers are recommended:

XML

\<?xml version="1.0" encoding="utf-8"?\>  
\<course...\>

For external integrations or specific XML schemas (like SAML metadata or specialized reporting), the standard W3C namespaces (xmlns:xsi, xmlns:xs) may appear, but for standard courseware, they are implicit.15

The xblock-family Attribute:  
A critical "namespace-like" feature in OLX is the xblock-family attribute. This is used by the XBlock runtime to disambiguate between legacy "Capa" descriptors and modern XBlock implementations.

* **Usage:** \<poll xblock-family="xblock.v1"...\>  
* **Significance:** This tells the import parser to delegate the parsing of this node to the xblock.v1 runtime handler rather than the default Modulestore handler. It is mandatory for many third-party XBlocks (Polls, Surveys, LTI).17

## **6\. Component Architecture in OLX**

The hierarchical depth of Open edX courseware is strictly enforced.

### **6.1 The Structural Hierarchy**

The platform defines a fixed path: **Chapter (Section) \-\> Sequential (Subsection) \-\> Vertical (Unit) \-\> Component**.

#### **6.1.1 Chapters**

Defined in chapter/. These represent the top-level navigation tabs or sections in the courseware.

XML

\<chapter display\_name\="Module 1" url\_name\="module\_1"\>  
    \<sequential url\_name\="lesson\_1" /\>  
\</chapter\>

The url\_name="lesson\_1" attribute instructs the parser to look for sequential/lesson\_1.xml.

#### **6.1.2 Sequentials**

Defined in sequential/. These represent the horizontal filmstrip navigation.

XML

\<sequential display\_name\="Lesson 1" url\_name\="lesson\_1"\>  
    \<vertical url\_name\="unit\_1" /\>  
\</sequential\>

#### **6.1.3 Verticals**

Defined in vertical/. These are the actual pages learners interact with. A vertical stacks components on top of each other.

XML

\<vertical display\_name\="Unit 1: Introduction"\>  
    \<video url\_name\="video\_1" /\>  
    \<html url\_name\="text\_1" /\>  
    \<discussion url\_name\="discuss\_1" xblock-family\="xblock.v1" /\>  
\</vertical\>

### **6.2 Component Specifications**

The "leaf" nodes of the tree are the components.

HTML Components (html/):  
HTML components can be defined in two ways:

1. **Pointer File:** An XML file (e.g., html/text\_1.xml) that points to a raw HTML file.  
   XML  
   \<html filename\="text\_1\_content" display\_name\="Reading" /\>

   This expects html/text\_1\_content.html to exist.  
2. **Embedded:** The HTML content is inside the XML.  
   XML  
   \<html\>\<p\>Hello World\</p\>\</html\>

   *Insight:* The pointer method is preferred for programmatic generation as it separates content from metadata and avoids XML escaping issues for the HTML body.13

Problem Components (problem/):  
Problems utilize the Capa schema.

XML

\<problem display\_name\="Quiz" markdown\="null"\>  
  \<p\>Question Body...\</p\>  
  \<multiplechoiceresponse\>  
    \<choicegroup type\="MultipleChoice"\>  
      \<choice correct\="true"\>A\</choice\>  
      \<choice correct\="false"\>B\</choice\>  
    \</choicegroup\>  
  \</multiplechoiceresponse\>  
\</problem\>

Polls and Surveys (XBlocks):  
These require the xblock-family attribute and often store their configuration in complex JSON-serialized attributes within the XML tag.

XML

\<poll  
    url\_name\="poll\_id"  
    xblock-family\="xblock.v1"  
    display\_name\="Feedback Poll"  
    question\="Did you like this video?"  
    answers\="\[...\]"\>  
\</poll\>

This structure allows the XBlock runtime to initialize the Python object with the correct settings map.18

## **7\. Data Integrity, Encoding, and Internationalization**

A specific focus of this research is the support for Cyrillic (Russian) characters and the general handling of non-ASCII encodings. Open edX assumes UTF-8 for content but enforces ASCII for architectural identifiers.

### **7.1 The UTF-8 Promise**

Open edX supports UTF-8 fully for:

* **display\_name Attributes:** You may name a chapter \<chapter display\_name="Глава 1: Начало"\>. This renders correctly in the LMS navigation.  
* **Content Bodies:** HTML files, problem text, and video transcripts can contain any Unicode character.  
* **Asset Filenames (Partial):** While technically possible in some versions, using Cyrillic filenames for static assets (e.g., static/картинка.png) is **strongly discouraged** due to varying support in unzip utilities and web server URL routing.

### **7.2 The ASCII Constraint: url\_name**

The platform utilizes the url\_name (slug) to generate RESTful URLs and database keys. The validation logic relies on a regex (often SLUG\_REGEX) that typically permits only alphanumeric characters, hyphens, and underscores.

**Regex Rule:** ^\[a-zA-Z0-9\\-\_\]+$.21

The Cyrillic Pitfall:  
Attempting to use Cyrillic in the url\_name or the corresponding XML filename will lead to import failures or 404 errors in the LMS.

* **Invalid:** \<chapter url\_name="введение"\> (implies filename chapter/введение.xml).  
* **Valid:** \<chapter url\_name="vvedenie" display\_name="Введение"\> (implies filename chapter/vvedenie.xml).

**Insight:** When programmatically generating courses from a Russian source system, developers must implement a transliteration or hashing step to convert source IDs into safe ASCII slugs for the url\_name, while preserving the original Cyrillic text in the display\_name.22

## **8\. Operational Implementation Guide**

Implementing a programmatic import workflow requires careful scripting to handle the asynchronous nature of the API and the potential for errors.

### **8.1 Python Implementation Strategy**

The following Python pseudo-code illustrates the robust pattern for interacting with the API.

Step 1: Authenticate  
Obtain a JWT using the client\_credentials grant.

Python

token\_resp \= requests.post(  
    f"{LMS\_ROOT}/oauth2/access\_token",  
    data={  
        "grant\_type": "client\_credentials",  
        "client\_id": CLIENT\_ID,  
        "client\_secret": CLIENT\_SECRET,  
        "token\_type": "jwt"  
    }  
)  
access\_token \= token\_resp.json()\['access\_token'\]

Step 2: Upload Payload  
Send the tarball. Note the use of course\_data as the key.

Python

headers \= {"Authorization": f"JWT {access\_token}"}  
files \= {"course\_data": open("course.tar.gz", "rb")}  
import\_resp \= requests.post(  
    f"{CMS\_ROOT}/api/courses/v0/import/{COURSE\_ID}/",  
    headers=headers,  
    files=files  
)  
task\_id \= import\_resp.json()

Step 3: Poll for Completion  
Loop until the status is final.

Python

while True:  
    status\_resp \= requests.get(  
        f"{CMS\_ROOT}/api/courses/v0/import/{COURSE\_ID}/?task\_id={task\_id}",  
        headers=headers  
    )  
    state \= status\_resp.json()\['state'\]  
    if state \== 'SUCCESS':  
        print("Import Complete")  
        break  
    elif state \== 'FAILURE':  
        print(f"Error: {status\_resp.json()\['result'\]}")  
        break  
    time.sleep(2)

### **8.2 Common Failure Modes and Debugging**

* **Timeout (504 Gateway Timeout):** If the initial POST takes too long (uploading a 1GB tarball), the load balancer (Nginx/AWS ALB) may kill the connection.  
  * *Mitigation:* Keep the tarball small. Do not include large video files in static/. Use external video hosting (YouTube/S3) and reference them by URL.  
* **Unpacking Error:** The tarball structure is invalid.  
  * *Mitigation:* Ensure you tar the *contents* of the directory, not the directory itself, or ensure the top-level folder matches expectations.  
* **Permissions (403):** The service user is not a team member.  
  * *Mitigation:* Programmatically add the service user to the course using the api/courses/v1/courses/{id}/team/ endpoint (if available) or via Django management commands before importing.

## **9\. Conclusion**

The Open edX Redwood Course Import API, while relying on the established OLX standard, remains the most reliable method for bulk course operations. It bridges the gap between external content systems and the Open edX Modulestore through a secure, asynchronous pipeline. By adhering to the strict structural requirements of OLX—specifically the hierarchy of components and the ASCII constraints on identifiers—and by implementing robust polling clients, organizations can automate the lifecycle of their courseware. This capability is essential for modern EdTech ecosystems where content is dynamic, versioned, and continuously deployed.

#### **Источники**

1. openedx/edx-platform: The Open edX LMS & Studio, powering education sites around the world\! \- GitHub, дата последнего обращения: декабря 7, 2025, [https://github.com/openedx/edx-platform](https://github.com/openedx/edx-platform)  
2. How to overwrite existing course content using 'manage.py cms import' \- Site Operators, дата последнего обращения: декабря 7, 2025, [https://discuss.openedx.org/t/how-to-overwrite-existing-course-content-using-manage-py-cms-import/743](https://discuss.openedx.org/t/how-to-overwrite-existing-course-content-using-manage-py-cms-import/743)  
3. REST API for course import / export \- ed | Xchange \- OpenCraft, дата последнего обращения: декабря 7, 2025, [https://edxchange.opencraft.com/t/rest-api-for-course-import-export/86/](https://edxchange.opencraft.com/t/rest-api-for-course-import-export/86/)  
4. Auto course creation and content creation \- Development \- Open ..., дата последнего обращения: декабря 7, 2025, [https://discuss.openedx.org/t/auto-course-creation-and-content-creation/17020](https://discuss.openedx.org/t/auto-course-creation-and-content-creation/17020)  
5. How To Use the REST API — edx-platform documentation, дата последнего обращения: декабря 7, 2025, [https://docs.openedx.org/projects/edx-platform/en/latest/how-tos/use\_the\_api.html](https://docs.openedx.org/projects/edx-platform/en/latest/how-tos/use_the_api.html)  
6. Using the curl method to automate import/export of Open edX courses \- Appsembler, дата последнего обращения: декабря 7, 2025, [https://appsembler.com/docs/using-the-curl-method-to-automate-import-export-of-courses/](https://appsembler.com/docs/using-the-curl-method-to-automate-import-export-of-courses/)  
7. Programatically enroll or unenroll students \- Site Operators \- Open edX discussions, дата последнего обращения: декабря 7, 2025, [https://discuss.openedx.org/t/programatically-enroll-or-unenroll-students/4689](https://discuss.openedx.org/t/programatically-enroll-or-unenroll-students/4689)  
8. Error when importing a course \- Open edX \- Overhang.IO, дата последнего обращения: декабря 7, 2025, [https://discuss.overhang.io/t/error-when-importing-a-course/111](https://discuss.overhang.io/t/error-when-importing-a-course/111)  
9. How to import and export courses in Open edX? \- cmsGalaxy, дата последнего обращения: декабря 7, 2025, [https://www.cmsgalaxy.com/blog/how-to-import-and-export-courses-in-open-edx/](https://www.cmsgalaxy.com/blog/how-to-import-and-export-courses-in-open-edx/)  
10. Import a Course — Latest documentation \- Open edX Documentation, дата последнего обращения: декабря 7, 2025, [https://docs.openedx.org/en/latest/educators/how-tos/releasing-course/import\_course.html](https://docs.openedx.org/en/latest/educators/how-tos/releasing-course/import_course.html)  
11. Open edX Course import error \- Site Operations Help, дата последнего обращения: декабря 7, 2025, [https://discuss.openedx.org/t/open-edx-course-import-error/903](https://discuss.openedx.org/t/open-edx-course-import-error/903)  
12. InvalidTabsException on import, leads to AttributeError: 'NoneType' object has no attribute 'data\_dir' \#15 \- GitHub, дата последнего обращения: декабря 7, 2025, [https://github.com/edx/demo-test-course/issues/15](https://github.com/edx/demo-test-course/issues/15)  
13. The OLX Structure of a Sample Course — Latest documentation, дата последнего обращения: декабря 7, 2025, [https://docs.openedx.org/en/latest/educators/olx/example-course/insider-structure.html](https://docs.openedx.org/en/latest/educators/olx/example-course/insider-structure.html)  
14. The OLX Courseware Structure — Latest documentation, дата последнего обращения: декабря 7, 2025, [https://docs.openedx.org/en/latest/educators/olx/organizing-course/course-xml-file.html](https://docs.openedx.org/en/latest/educators/olx/organizing-course/course-xml-file.html)  
15. 0001104659-20-073090.txt \- SEC.gov, дата последнего обращения: декабря 7, 2025, [https://www.sec.gov/Archives/edgar/data/72741/000110465920073090/0001104659-20-073090.txt](https://www.sec.gov/Archives/edgar/data/72741/000110465920073090/0001104659-20-073090.txt)  
16. CFR-2024-title46-vol5.xml \- GovInfo, дата последнего обращения: декабря 7, 2025, [https://www.govinfo.gov/content/pkg/CFR-2024-title46-vol5/xml/CFR-2024-title46-vol5.xml](https://www.govinfo.gov/content/pkg/CFR-2024-title46-vol5/xml/CFR-2024-title46-vol5.xml)  
17. Building and Running an Open edX Course \- Cypress Release, дата последнего обращения: декабря 7, 2025, [https://media.readthedocs.org/pdf/open-edx-building-and-running-a-course//named-release-cypress/open-edx-building-and-running-a-course.pdf](https://media.readthedocs.org/pdf/open-edx-building-and-running-a-course//named-release-cypress/open-edx-building-and-running-a-course.pdf)  
18. Create a Poll (via OLX) — Latest documentation, дата последнего обращения: декабря 7, 2025, [https://docs.openedx.org/en/latest/educators/how-tos/course\_development/exercise\_tools/create\_poll\_olx.html](https://docs.openedx.org/en/latest/educators/how-tos/course_development/exercise_tools/create_poll_olx.html)  
19. The olx-example course.xml File \- Open edX Documentation, дата последнего обращения: декабря 7, 2025, [https://docs.openedx.org/en/latest/educators/olx/example-course/insider-course-xml.html](https://docs.openedx.org/en/latest/educators/olx/example-course/insider-course-xml.html)  
20. 10.30. Poll Tool — Building and Running an edX Course documentation, дата последнего обращения: декабря 7, 2025, [https://edx.readthedocs.io/projects/edx-partner-course-staff/en/latest/exercises\_tools/poll\_question.html](https://edx.readthedocs.io/projects/edx-partner-course-staff/en/latest/exercises_tools/poll_question.html)  
21. SyntaxWarning: Invalid Escape Sequence · Issue \#223 \- GitHub, дата последнего обращения: декабря 7, 2025, [https://github.com/Tib3rius/AutoRecon/issues/223](https://github.com/Tib3rius/AutoRecon/issues/223)  
22. App-learning does not support non-unicode in course id \- Open edX discussions, дата последнего обращения: декабря 7, 2025, [https://discuss.openedx.org/t/app-learning-does-not-support-non-unicode-in-course-id/16967](https://discuss.openedx.org/t/app-learning-does-not-support-non-unicode-in-course-id/16967)