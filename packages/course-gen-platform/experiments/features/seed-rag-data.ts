/**
 * T083: Seed RAG Data Script
 *
 * Creates 5 test courses with different topics and formats, processes them through
 * the full RAG workflow, and verifies correct vector storage in Qdrant.
 *
 * Workflow per document:
 * 1. Create inline test document (MD/TXT format for simplicity)
 * 2. Chunk using hierarchical markdown chunker (T075)
 * 3. Enrich with metadata (organization_id, course_id, document_id)
 * 4. Generate embeddings with Jina-v3 (T076)
 * 5. Upload vectors to Qdrant (T077)
 * 6. Verify vectors stored correctly
 * 7. Test semantic search across all courses
 *
 * Test Documents:
 * - Document 1: Introduction to Machine Learning (Markdown)
 * - Document 2: Web Development Basics (Plain Text)
 * - Document 3: Database Design (Markdown)
 * - Document 4: Software Architecture (Markdown)
 * - Document 5: Cybersecurity Fundamentals (Plain Text)
 *
 * @module experiments/features/seed-rag-data
 */

import { chunkMarkdown } from '../../src/shared/embeddings/markdown-chunker';
import { enrichChunks } from '../../src/shared/embeddings/metadata-enricher';
import { generateEmbeddingsWithLateChunking } from '../../src/shared/embeddings/generate';
import { uploadChunksToQdrant } from '../../src/shared/qdrant/upload';
import { searchChunks } from '../../src/shared/qdrant/search';
import { getCollectionStats } from '../../src/shared/qdrant/upload';

/**
 * Test document definition
 */
interface TestDocument {
  id: string;
  name: string;
  topic: string;
  format: 'md' | 'txt';
  content: string;
  course_id: string;
  organization_id: string;
}

/**
 * Test organization and course IDs (using predictable UUIDs)
 */
const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';

// 5 different course IDs for 5 documents
const COURSE_IDS = {
  ml: '10000000-0000-0000-0000-000000000001',
  webdev: '20000000-0000-0000-0000-000000000002',
  database: '30000000-0000-0000-0000-000000000003',
  architecture: '40000000-0000-0000-0000-000000000004',
  cybersecurity: '50000000-0000-0000-0000-000000000005',
};

/**
 * Test documents with realistic content
 */
const TEST_DOCUMENTS: TestDocument[] = [
  {
    id: 'doc-ml-001',
    name: 'introduction-to-machine-learning.md',
    topic: 'Machine Learning',
    format: 'md',
    course_id: COURSE_IDS.ml,
    organization_id: TEST_ORG_ID,
    content: `# Introduction to Machine Learning

Machine learning is a subset of artificial intelligence (AI) that focuses on building systems that learn from data. Instead of being explicitly programmed, these systems improve their performance through experience.

## What is Machine Learning?

Machine learning algorithms use statistical techniques to give computer systems the ability to "learn" from data without being explicitly programmed. The goal is to enable computers to learn automatically from data and make predictions or decisions.

### Key Concepts

Machine learning is based on several fundamental concepts:

1. **Training Data**: The dataset used to teach the algorithm
2. **Features**: The input variables used to make predictions
3. **Labels**: The output or target variable we want to predict
4. **Model**: The mathematical representation of the pattern learned from data

## Types of Machine Learning

There are three main types of machine learning algorithms.

### Supervised Learning

Supervised learning uses labeled training data to learn the relationship between inputs and outputs. The algorithm learns from examples where the correct answer is known.

**Example algorithms**:
- Linear Regression: Predicts continuous values
- Logistic Regression: Predicts binary outcomes
- Decision Trees: Makes decisions based on feature values
- Neural Networks: Learns complex patterns using interconnected nodes

**Applications**: Email spam detection, image classification, price prediction

### Unsupervised Learning

Unsupervised learning finds patterns in unlabeled data without predefined categories or labels. The algorithm discovers hidden structures in the data.

**Example algorithms**:
- K-Means Clustering: Groups similar data points together
- Principal Component Analysis (PCA): Reduces data dimensionality
- Autoencoders: Learns compressed representations of data

**Applications**: Customer segmentation, anomaly detection, data compression

### Reinforcement Learning

Reinforcement learning trains agents to make sequences of decisions by rewarding desired behaviors and punishing undesired ones. The agent learns through trial and error.

**Example algorithms**:
- Q-Learning: Learns the value of actions in different states
- Deep Q-Networks (DQN): Combines Q-learning with deep neural networks
- Policy Gradient Methods: Directly optimizes the decision-making policy

**Applications**: Game playing (AlphaGo), robotics, autonomous driving

## Deep Learning

Deep learning is a subset of machine learning that uses neural networks with multiple layers. These networks can learn hierarchical representations of data, making them powerful for complex tasks.

### Convolutional Neural Networks (CNNs)

CNNs are specialized neural networks designed for processing grid-like data such as images. They use convolutional layers to detect features like edges, textures, and patterns.

**Architecture**:
1. Convolutional layers: Extract features from input
2. Pooling layers: Reduce spatial dimensions
3. Fully connected layers: Make final predictions

**Applications**: Image recognition, object detection, facial recognition

### Recurrent Neural Networks (RNNs)

RNNs are designed for sequential data such as time series or text. They maintain an internal state (memory) that allows them to process sequences of inputs.

**Variants**:
- Long Short-Term Memory (LSTM): Handles long-term dependencies
- Gated Recurrent Units (GRU): Simplified version of LSTM

**Applications**: Language translation, speech recognition, time series forecasting

## Model Evaluation

Evaluating machine learning models is crucial to understand their performance and generalization ability.

### Common Metrics

**For Classification**:
- Accuracy: Percentage of correct predictions
- Precision: Proportion of positive predictions that are correct
- Recall: Proportion of actual positives that are identified
- F1-Score: Harmonic mean of precision and recall

**For Regression**:
- Mean Absolute Error (MAE): Average absolute difference
- Mean Squared Error (MSE): Average squared difference
- R-squared: Proportion of variance explained by the model

### Cross-Validation

Cross-validation is a technique to assess model performance by splitting data into training and validation sets multiple times. K-fold cross-validation divides data into K subsets and trains K models.

## Best Practices

When building machine learning systems, follow these best practices:

1. **Data Quality**: Ensure clean, representative training data
2. **Feature Engineering**: Create meaningful features from raw data
3. **Model Selection**: Choose appropriate algorithms for the task
4. **Hyperparameter Tuning**: Optimize model parameters systematically
5. **Regularization**: Prevent overfitting with techniques like L1/L2 regularization
6. **Monitoring**: Track model performance in production continuously

## Conclusion

Machine learning is a powerful technology that enables computers to learn from data and make intelligent decisions. Understanding the different types of algorithms and their applications is essential for building effective ML systems.
`,
  },
  {
    id: 'doc-webdev-002',
    name: 'web-development-basics.txt',
    topic: 'Web Development',
    format: 'txt',
    course_id: COURSE_IDS.webdev,
    organization_id: TEST_ORG_ID,
    content: `Web Development Basics

Web development is the process of building and maintaining websites and web applications. It involves several technologies and skills working together to create functional, accessible, and user-friendly experiences on the internet.

Core Technologies

HTML (HyperText Markup Language)
HTML is the foundation of web development. It provides the structure and content of web pages using elements like headings, paragraphs, links, images, and forms. HTML5 introduced semantic elements like header, nav, main, article, and footer that improve document structure and accessibility.

CSS (Cascading Style Sheets)
CSS controls the visual presentation of HTML content. It handles layout, colors, fonts, spacing, and responsive design. Modern CSS includes powerful features like Flexbox for one-dimensional layouts, Grid for two-dimensional layouts, and animations for interactive effects.

JavaScript
JavaScript adds interactivity and dynamic behavior to web pages. It runs in the browser and can manipulate the DOM (Document Object Model), handle user events, make API requests, and update page content without reloading. JavaScript is essential for modern web applications.

Frontend Development

Frontend development focuses on what users see and interact with in their browsers. It involves creating the user interface (UI) and user experience (UX) of web applications.

Responsive Design
Responsive design ensures websites work well on all devices and screen sizes. This is achieved using CSS media queries, flexible layouts, and relative units. Mobile-first design starts with mobile layouts and progressively enhances for larger screens.

Frontend Frameworks
Modern frontend development often uses frameworks and libraries to improve productivity and maintainability:

React: Component-based library for building user interfaces
Vue.js: Progressive framework for building UIs
Angular: Full-featured framework by Google
Svelte: Compiler-based framework with minimal runtime

These frameworks provide features like component reusability, state management, routing, and optimized rendering.

Backend Development

Backend development handles server-side logic, databases, and APIs. It processes requests from the frontend, manages data, and sends responses back to the client.

Server-Side Languages
Popular backend languages include:
- Node.js: JavaScript runtime for server-side applications
- Python: Versatile language with frameworks like Django and Flask
- PHP: Widely used for web development with frameworks like Laravel
- Ruby: Known for Ruby on Rails framework
- Java: Enterprise-grade language with Spring framework

Databases
Databases store and manage application data:

SQL Databases (Relational):
- PostgreSQL: Feature-rich open-source database
- MySQL: Popular open-source database
- SQLite: Lightweight embedded database

NoSQL Databases (Non-relational):
- MongoDB: Document-oriented database
- Redis: In-memory key-value store
- Cassandra: Distributed wide-column store

RESTful APIs
REST (Representational State Transfer) is an architectural style for designing APIs. RESTful APIs use HTTP methods (GET, POST, PUT, DELETE) to perform CRUD operations and return data in JSON format. They provide a standard way for frontend and backend to communicate.

Web Security

Security is crucial for protecting user data and preventing attacks:

HTTPS: Encrypts data in transit using SSL/TLS certificates
Authentication: Verifies user identity (passwords, OAuth, JWT)
Authorization: Controls access to resources based on permissions
Input Validation: Prevents injection attacks (SQL injection, XSS)
CSRF Protection: Prevents unauthorized actions on behalf of users
Rate Limiting: Prevents abuse and DDoS attacks

Development Tools

Modern web development relies on various tools:

Version Control
Git is the standard version control system. It tracks code changes, enables collaboration, and allows reverting to previous versions. GitHub, GitLab, and Bitbucket are popular Git hosting platforms.

Package Managers
npm (Node Package Manager) and yarn manage JavaScript dependencies. They install libraries, handle versioning, and automate tasks.

Build Tools
Webpack, Vite, and Parcel bundle and optimize code for production. They handle tasks like transpiling modern JavaScript, minifying code, and optimizing assets.

DevOps and Deployment

CI/CD (Continuous Integration/Continuous Deployment)
Automated pipelines that test and deploy code changes. Tools include GitHub Actions, GitLab CI, Jenkins, and CircleCI.

Hosting and Deployment
Cloud platforms for deploying web applications:
- Vercel: Specialized for frontend frameworks
- Netlify: JAMstack hosting with CDN
- AWS (Amazon Web Services): Full cloud infrastructure
- Google Cloud Platform: Scalable cloud services
- Heroku: Platform-as-a-Service for easy deployment

Best Practices

Write clean, maintainable code with consistent formatting
Use semantic HTML for better accessibility and SEO
Optimize performance: compress images, minify code, use lazy loading
Follow accessibility guidelines (WCAG) for inclusive design
Test across browsers and devices
Document code and APIs thoroughly
Implement error handling and logging
Keep dependencies updated and secure

The web development landscape evolves rapidly, but mastering these fundamentals provides a strong foundation for building modern web applications.
`,
  },
  {
    id: 'doc-database-003',
    name: 'database-design.md',
    topic: 'Database Design',
    format: 'md',
    course_id: COURSE_IDS.database,
    organization_id: TEST_ORG_ID,
    content: `# Database Design Principles

Database design is the process of organizing data according to a database model. Good database design ensures data integrity, minimizes redundancy, and optimizes query performance.

## Relational Database Concepts

### What is a Relational Database?

A relational database organizes data into tables (relations) with rows (tuples) and columns (attributes). Tables can be linked through relationships using primary and foreign keys.

### Key Components

**Tables**: Store data in structured rows and columns
**Primary Key**: Unique identifier for each row in a table
**Foreign Key**: References a primary key in another table, creating relationships
**Index**: Data structure that improves query performance
**Constraint**: Rules enforcing data integrity

## Normalization

Normalization is the process of organizing data to reduce redundancy and improve data integrity. It involves decomposing tables into smaller tables and defining relationships between them.

### First Normal Form (1NF)

Requirements:
- Each column contains atomic (indivisible) values
- Each row is unique (has a primary key)
- No repeating groups or arrays

Example:
Before 1NF: A "Customers" table with a "PhoneNumbers" column containing multiple phone numbers
After 1NF: Separate "CustomerPhones" table with one phone number per row

### Second Normal Form (2NF)

Requirements:
- Must be in 1NF
- All non-key attributes are fully dependent on the primary key
- No partial dependencies

This applies to tables with composite primary keys where some attributes depend on only part of the key.

### Third Normal Form (3NF)

Requirements:
- Must be in 2NF
- No transitive dependencies (non-key attributes depend only on the primary key)
- Remove attributes that depend on other non-key attributes

### Boyce-Codd Normal Form (BCNF)

A stricter version of 3NF. Every determinant must be a candidate key. This eliminates remaining anomalies in 3NF.

## Entity-Relationship (ER) Modeling

ER modeling is a technique for designing databases by identifying entities, attributes, and relationships.

### Entities

Entities are objects or concepts that exist independently and have data stored about them. Examples: Customer, Product, Order, Employee.

**Entity Types**:
- Strong Entity: Exists independently (Customer, Product)
- Weak Entity: Depends on a strong entity (OrderItem depends on Order)

### Attributes

Attributes are properties or characteristics of entities.

**Attribute Types**:
- Simple: Cannot be divided (Age, Price)
- Composite: Can be divided into sub-attributes (Name = FirstName + LastName)
- Derived: Calculated from other attributes (Age from BirthDate)
- Multi-valued: Can have multiple values (PhoneNumbers)

### Relationships

Relationships describe how entities are connected.

**Cardinality**:
- One-to-One (1:1): One entity instance relates to one instance of another
- One-to-Many (1:N): One entity instance relates to many instances of another
- Many-to-Many (M:N): Many instances relate to many instances

**Example Relationships**:
- Customer ← places → Order (1:N)
- Student ← enrolls in → Course (M:N, requires junction table)
- Person ← has → Passport (1:1)

## SQL Data Definition Language (DDL)

DDL statements define database structure.

### CREATE TABLE

\`\`\`sql
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending'
);
\`\`\`

### Constraints

**PRIMARY KEY**: Ensures uniqueness and identifies rows
**FOREIGN KEY**: Maintains referential integrity
**UNIQUE**: Ensures all values in a column are different
**NOT NULL**: Prevents null values
**CHECK**: Validates data against a condition
**DEFAULT**: Provides default values

## Indexing Strategies

Indexes improve query performance by creating fast lookup paths to data.

### Types of Indexes

**B-Tree Index**: Default index type, good for equality and range queries
**Hash Index**: Fast for equality comparisons, not for ranges
**Full-Text Index**: Optimized for text search
**Partial Index**: Index on a subset of rows matching a condition

### Index Best Practices

1. Index columns used in WHERE clauses frequently
2. Index foreign keys for faster joins
3. Create composite indexes for queries filtering multiple columns
4. Avoid over-indexing (slows INSERT/UPDATE/DELETE operations)
5. Monitor index usage and remove unused indexes

## Query Optimization

Optimizing queries is essential for database performance.

### Analyzing Queries

Use EXPLAIN to understand query execution plans:

\`\`\`sql
EXPLAIN ANALYZE
SELECT c.first_name, c.last_name, COUNT(o.order_id) as order_count
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.first_name, c.last_name
HAVING COUNT(o.order_id) > 5;
\`\`\`

### Optimization Techniques

**Select Only Needed Columns**: Use specific columns instead of SELECT *
**Use JOINs Efficiently**: Ensure foreign keys are indexed
**Filter Early**: Apply WHERE conditions before JOINs when possible
**Avoid N+1 Queries**: Fetch related data in a single query using JOINs
**Use Pagination**: Limit result sets with LIMIT and OFFSET
**Cache Results**: Store frequently accessed data in memory

## Database Transactions

Transactions ensure data consistency through ACID properties.

### ACID Properties

**Atomicity**: All operations in a transaction succeed or all fail
**Consistency**: Transaction brings database from one valid state to another
**Isolation**: Concurrent transactions don't interfere with each other
**Durability**: Committed changes are permanent

### Transaction Example

\`\`\`sql
BEGIN TRANSACTION;

UPDATE accounts SET balance = balance - 100 WHERE account_id = 1;
UPDATE accounts SET balance = balance + 100 WHERE account_id = 2;

COMMIT;
\`\`\`

If any operation fails, use ROLLBACK to undo all changes.

## Database Security

Protecting sensitive data is critical.

### Security Best Practices

1. **Authentication**: Verify user identity with strong credentials
2. **Authorization**: Grant minimal necessary permissions (principle of least privilege)
3. **Encryption**: Encrypt data at rest and in transit
4. **SQL Injection Prevention**: Use parameterized queries or ORMs
5. **Audit Logging**: Track who accessed what data and when
6. **Backup and Recovery**: Regularly backup data with tested recovery procedures

### Role-Based Access Control

\`\`\`sql
CREATE ROLE readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;

CREATE USER reporting_user WITH PASSWORD 'secure_password';
GRANT readonly_user TO reporting_user;
\`\`\`

## Scalability Patterns

As data grows, consider these scalability strategies:

### Vertical Scaling

Increase server capacity (CPU, RAM, storage). Simple but has physical limits.

### Horizontal Scaling

Distribute data across multiple servers:

**Replication**: Copy data to multiple servers for read scalability and high availability
- Master-Slave: One write server, multiple read replicas
- Multi-Master: Multiple servers accept writes (complex conflict resolution)

**Sharding**: Partition data across servers by key (e.g., customer ID ranges)
- Improves write scalability
- Requires careful shard key selection

### Caching

Use in-memory stores like Redis to cache frequently accessed data, reducing database load.

## Conclusion

Effective database design requires understanding data relationships, applying normalization principles, and implementing appropriate indexing and security measures. These fundamentals ensure databases are efficient, maintainable, and scalable.
`,
  },
  {
    id: 'doc-architecture-004',
    name: 'software-architecture.md',
    topic: 'Software Architecture',
    format: 'md',
    course_id: COURSE_IDS.architecture,
    organization_id: TEST_ORG_ID,
    content: `# Software Architecture Patterns

Software architecture defines the high-level structure of a system, including its components, their relationships, and principles governing their design and evolution.

## What is Software Architecture?

Software architecture represents the fundamental decisions about how a system is organized. It serves as a blueprint for both the system and the project, defining:

- Component structure and responsibilities
- Communication patterns between components
- Technology choices and constraints
- Quality attributes (scalability, security, performance)
- Trade-offs between competing concerns

## Layered Architecture

### Overview

Layered architecture organizes code into horizontal layers, each with a specific responsibility. Higher layers depend on lower layers, but not vice versa.

### Common Layers

**Presentation Layer**: User interface and user interaction
**Business Logic Layer**: Core application logic and business rules
**Data Access Layer**: Database operations and data persistence
**Infrastructure Layer**: Cross-cutting concerns (logging, caching, messaging)

### Benefits

- Clear separation of concerns
- Easier testing and maintenance
- Team members can work on different layers independently
- Promotes code reusability

### Drawbacks

- Can lead to performance overhead due to layer traversal
- Risk of creating anemic domain models
- May become tightly coupled if not designed carefully

## Microservices Architecture

### Overview

Microservices decompose applications into small, independent services that communicate over network protocols. Each service owns its data and can be developed, deployed, and scaled independently.

### Key Characteristics

**Single Responsibility**: Each service focuses on one business capability
**Autonomous**: Services can be developed and deployed independently
**Decentralized**: No central orchestrator; services coordinate through events/APIs
**Polyglot**: Services can use different technologies and languages
**Resilient**: Failures in one service don't cascade to others

### Communication Patterns

**Synchronous**: REST APIs, gRPC for request-response communication
**Asynchronous**: Message queues (RabbitMQ, Kafka) for event-driven communication

### Benefits

- Independent scalability of services
- Technology flexibility per service
- Faster deployment cycles
- Better fault isolation

### Challenges

- Increased operational complexity
- Distributed system challenges (network latency, partial failures)
- Data consistency across services
- Testing and debugging complexity

## Event-Driven Architecture

### Overview

Event-driven architecture uses events to trigger and communicate between decoupled services. Producers emit events when state changes occur, and consumers react to those events.

### Components

**Event Producers**: Generate events when something notable happens
**Event Consumers**: Subscribe to events and react accordingly
**Event Bus/Broker**: Routes events from producers to consumers (Kafka, RabbitMQ, AWS SNS)
**Event Store**: Optionally persists events for replay and auditing

### Event Types

**Domain Events**: Represent business-significant occurrences (OrderPlaced, PaymentProcessed)
**Integration Events**: Facilitate communication between bounded contexts
**Command Events**: Request an action to be performed

### Benefits

- Loose coupling between services
- High scalability and resilience
- Easy to add new consumers without modifying producers
- Natural fit for real-time and reactive systems

### Challenges

- Eventual consistency (data may be temporarily inconsistent)
- Debugging distributed event flows
- Ensuring event ordering and idempotency
- Schema evolution and versioning

## Domain-Driven Design (DDD)

### Overview

DDD is an approach to software development that focuses on modeling the business domain and using that model to drive design decisions.

### Core Concepts

**Bounded Context**: A boundary within which a domain model applies
**Ubiquitous Language**: Shared terminology between developers and domain experts
**Entities**: Objects with identity that persist over time
**Value Objects**: Objects defined by their attributes, not identity
**Aggregates**: Clusters of entities and value objects with a root entity
**Domain Events**: Represent something that happened in the domain
**Repositories**: Abstractions for data access

### Strategic Design

DDD strategic design defines boundaries between contexts and how they interact:

**Context Mapping**: Identifying relationships between bounded contexts
- Shared Kernel: Two contexts share a subset of the model
- Customer-Supplier: One context depends on another
- Conformist: Downstream context conforms to upstream
- Anti-Corruption Layer: Translates between contexts to maintain independence

### Tactical Design

DDD tactical patterns implement the domain model:

**Aggregates**: Enforce invariants and define transactional boundaries
**Domain Services**: Operations that don't belong to a single entity
**Application Services**: Coordinate use cases and orchestrate domain logic
**Domain Events**: Notify other parts of the system about changes

## CQRS (Command Query Responsibility Segregation)

### Overview

CQRS separates read operations (queries) from write operations (commands) into different models. This allows optimizing each model for its specific use case.

### Components

**Command Model**: Handles writes, validates business rules, maintains consistency
**Query Model**: Optimized for reads, possibly denormalized or cached
**Command Handlers**: Process commands and update the write model
**Query Handlers**: Process queries against the read model
**Synchronization**: Keep read and write models in sync (often through events)

### Benefits

- Optimized read and write performance independently
- Simplified queries (no complex joins in read model)
- Better scalability (scale reads and writes separately)
- Clearer code organization

### When to Use

CQRS adds complexity and should be used when:
- Read and write patterns differ significantly
- High read/write traffic requires independent scaling
- Complex business logic benefits from separation
- Event sourcing is being used

## Serverless Architecture

### Overview

Serverless architecture uses cloud-provided functions and services, abstracting away server management. Code runs in stateless containers triggered by events.

### Key Characteristics

**Function as a Service (FaaS)**: Deploy individual functions (AWS Lambda, Azure Functions)
**Event-Driven**: Functions triggered by events (HTTP, database changes, file uploads)
**Auto-Scaling**: Automatically scales based on demand
**Pay-Per-Use**: Charged only for actual execution time

### Architecture Pattern

**API Gateway**: Routes HTTP requests to functions
**Functions**: Stateless handlers for specific tasks
**Managed Services**: Leverage cloud services (databases, storage, queues)
**Event Sources**: Triggers that invoke functions

### Benefits

- No server management
- Automatic scaling
- Reduced operational costs
- Faster time to market

### Challenges

- Vendor lock-in
- Cold start latency
- Debugging and monitoring complexity
- Limited execution time and memory

## Hexagonal Architecture (Ports and Adapters)

### Overview

Hexagonal architecture isolates the core business logic from external concerns by defining ports (interfaces) and adapters (implementations) for all interactions.

### Structure

**Core Domain**: Business logic and domain models
**Ports**: Interfaces defining how external systems interact with the core
**Adapters**: Implementations of ports (database, REST API, message queue)

**Primary Adapters**: Trigger use cases (HTTP controllers, CLI)
**Secondary Adapters**: Provide services to the core (database repositories, external APIs)

### Benefits

- Testable core domain without infrastructure dependencies
- Technology agnostic domain logic
- Easy to swap implementations (different databases, APIs)
- Clear separation of concerns

## Choosing an Architecture

Selecting the right architecture depends on various factors:

### Considerations

**System Requirements**:
- Scalability needs (traffic patterns, growth projections)
- Performance requirements (latency, throughput)
- Reliability and availability targets

**Team Factors**:
- Team size and expertise
- Organizational structure (Conway's Law)
- Development velocity requirements

**Technical Constraints**:
- Existing systems and integrations
- Technology stack preferences
- Budget and operational capabilities

### Decision Framework

1. **Start Simple**: Begin with a monolith or layered architecture
2. **Identify Pain Points**: Monitor performance, development velocity, scalability issues
3. **Extract When Needed**: Refactor to more complex patterns as requirements evolve
4. **Don't Over-Engineer**: Choose the simplest architecture that meets requirements

## Architectural Qualities

### Scalability

The ability to handle increased load by adding resources.

**Vertical Scaling**: Increase capacity of a single server
**Horizontal Scaling**: Add more servers to distribute load

### Reliability

The ability to function correctly despite failures.

**Fault Tolerance**: System continues operating when components fail
**Redundancy**: Duplicate critical components
**Circuit Breakers**: Prevent cascading failures

### Security

Protection against unauthorized access and attacks.

**Defense in Depth**: Multiple layers of security controls
**Least Privilege**: Minimal necessary permissions
**Zero Trust**: Verify every request regardless of source

### Maintainability

The ease with which a system can be modified.

**Modularity**: Organize code into independent, cohesive modules
**Documentation**: Clear architecture documentation and code comments
**Testing**: Comprehensive test coverage at all levels

## Conclusion

Software architecture is about making informed trade-offs. There's no perfect architecture for every system. The best architecture evolves with the system's needs, balancing technical requirements, team capabilities, and business goals.
`,
  },
  {
    id: 'doc-cybersecurity-005',
    name: 'cybersecurity-fundamentals.txt',
    topic: 'Cybersecurity',
    format: 'txt',
    course_id: COURSE_IDS.cybersecurity,
    organization_id: TEST_ORG_ID,
    content: `Cybersecurity Fundamentals

Cybersecurity is the practice of protecting systems, networks, and programs from digital attacks. These attacks typically aim to access, change, or destroy sensitive information, extort money from users, or disrupt normal business operations.

Core Principles

The CIA Triad

Confidentiality: Ensuring information is accessible only to authorized individuals. This is achieved through encryption, access controls, and data classification.

Integrity: Maintaining the accuracy and consistency of data over its lifecycle. Integrity is violated when unauthorized modifications occur.

Availability: Ensuring authorized users have reliable access to information and resources when needed. This includes protection against denial-of-service attacks and system failures.

Defense in Depth

Defense in depth is a layered security approach using multiple defensive measures. If one layer fails, others provide backup protection. Layers include:
- Physical security
- Network security
- Application security
- Endpoint security
- Data security
- User awareness training

Common Threats

Malware

Malware (malicious software) is designed to damage, disrupt, or gain unauthorized access to systems.

Viruses: Self-replicating programs that attach to files and spread
Worms: Standalone programs that replicate and spread across networks
Trojans: Malicious programs disguised as legitimate software
Ransomware: Encrypts files and demands payment for decryption key
Spyware: Secretly monitors user activity and collects information
Rootkits: Hides the presence of malicious software on a system

Phishing

Phishing attacks use fraudulent emails, messages, or websites to trick users into revealing sensitive information like passwords, credit card numbers, or social security numbers.

Spear Phishing: Targeted phishing attacks aimed at specific individuals or organizations
Whaling: Phishing attacks targeting high-profile executives
Vishing: Voice phishing using phone calls
Smishing: Phishing via SMS text messages

Social Engineering

Social engineering manipulates people into divulging confidential information or performing actions that compromise security. Attackers exploit human psychology rather than technical vulnerabilities.

Techniques include:
- Pretexting: Creating a fabricated scenario to obtain information
- Baiting: Offering something enticing to execute malware
- Tailgating: Following authorized personnel into restricted areas
- Quid Pro Quo: Promising a benefit in exchange for information

Denial-of-Service (DoS) Attacks

DoS attacks overwhelm systems with traffic to make them unavailable to legitimate users.

DDoS (Distributed Denial-of-Service): Coordinated attack from multiple sources
Volumetric Attacks: Flood the network with excessive traffic
Protocol Attacks: Exploit weaknesses in network protocols
Application Layer Attacks: Target web applications and servers

Network Security

Firewalls

Firewalls monitor and control incoming and outgoing network traffic based on security rules. They act as a barrier between trusted internal networks and untrusted external networks.

Types of Firewalls:
- Packet-filtering firewalls: Inspect individual packets
- Stateful inspection firewalls: Track connection state
- Proxy firewalls: Filter application-layer traffic
- Next-generation firewalls: Combine multiple security functions

Intrusion Detection and Prevention Systems

IDS (Intrusion Detection System): Monitors network traffic for suspicious activity and alerts administrators
IPS (Intrusion Prevention System): Actively blocks detected threats

Detection Methods:
- Signature-based: Compares traffic against known attack patterns
- Anomaly-based: Identifies deviations from normal behavior
- Hybrid: Combines both approaches for comprehensive coverage

Virtual Private Networks (VPNs)

VPNs create encrypted tunnels for secure communication over public networks. They protect data in transit and hide IP addresses.

Use Cases:
- Remote employee access to corporate networks
- Secure communication between branch offices
- Protecting privacy when using public Wi-Fi

Encryption

Encryption transforms readable data into an encoded format that requires a key to decrypt.

Symmetric Encryption

Uses the same key for encryption and decryption. Fast and efficient for large amounts of data.

Common Algorithms:
- AES (Advanced Encryption Standard): Industry standard for symmetric encryption
- ChaCha20: Modern cipher used in TLS and VPNs

Asymmetric Encryption

Uses a pair of keys: public key for encryption, private key for decryption. Slower than symmetric encryption but enables secure key exchange.

Common Algorithms:
- RSA: Widely used for secure data transmission
- ECC (Elliptic Curve Cryptography): Provides strong security with smaller keys

Hashing

Creates a fixed-size fingerprint of data. Used for password storage and data integrity verification.

Common Hash Functions:
- SHA-256: Secure hash function from the SHA-2 family
- bcrypt: Designed specifically for password hashing with adaptive cost

Authentication and Access Control

Authentication

Authentication verifies the identity of users or systems.

Authentication Factors:
Something You Know: Passwords, PINs, security questions
Something You Have: Hardware tokens, smart cards, mobile devices
Something You Are: Biometrics (fingerprints, facial recognition, iris scans)

Multi-Factor Authentication (MFA)

MFA requires two or more authentication factors. This significantly improves security because compromising one factor isn't enough to gain access.

Implementation Methods:
- SMS codes (less secure due to SIM swapping)
- Authenticator apps (TOTP: Time-based One-Time Passwords)
- Hardware security keys (FIDO2/WebAuthn)
- Push notifications to trusted devices

Authorization

Authorization determines what authenticated users are allowed to do.

Access Control Models:
- Discretionary Access Control (DAC): Resource owners set permissions
- Mandatory Access Control (MAC): System enforces security policies
- Role-Based Access Control (RBAC): Permissions assigned based on roles
- Attribute-Based Access Control (ABAC): Permissions based on attributes

Application Security

Secure Coding Practices

Input Validation: Validate and sanitize all user input to prevent injection attacks
Output Encoding: Encode output to prevent cross-site scripting (XSS)
Error Handling: Don't expose sensitive information in error messages
Least Privilege: Run applications with minimum necessary permissions

Common Vulnerabilities

SQL Injection: Inserting malicious SQL code through user input
Cross-Site Scripting (XSS): Injecting malicious scripts into web pages
Cross-Site Request Forgery (CSRF): Forcing authenticated users to perform unwanted actions
XML External Entity (XXE): Exploiting XML parsers to access sensitive files
Server-Side Request Forgery (SSRF): Making server perform unauthorized requests

Security Testing

Static Analysis (SAST): Analyzes source code without executing it
Dynamic Analysis (DAST): Tests running applications for vulnerabilities
Penetration Testing: Simulated attacks to identify weaknesses
Dependency Scanning: Identifies vulnerable third-party libraries

Incident Response

Preparation

Establish incident response plan and team
Define roles and responsibilities
Set up monitoring and alerting systems
Prepare communication templates
Conduct regular drills and training

Detection and Analysis

Monitor systems for indicators of compromise
Investigate suspicious activity
Determine scope and severity of incidents
Document findings thoroughly

Containment, Eradication, and Recovery

Contain: Isolate affected systems to prevent spread
Eradicate: Remove malware and close vulnerabilities
Recover: Restore systems from clean backups
Validate: Ensure systems are clean and secure

Post-Incident Activities

Conduct lessons learned review
Update security controls based on findings
Improve detection capabilities
Document incident for future reference

Security Best Practices

Regular Updates and Patching

Keep operating systems, applications, and firmware up to date. Promptly apply security patches to address known vulnerabilities.

Strong Password Policies

Require complex passwords with minimum length
Enforce password expiration and reuse restrictions
Consider using passphrases instead of passwords
Implement account lockout after failed attempts

Security Awareness Training

Educate users about security threats
Conduct simulated phishing campaigns
Promote security-conscious culture
Provide regular training updates

Data Backup

Implement 3-2-1 backup strategy: 3 copies, 2 different media, 1 offsite
Test backup restoration regularly
Protect backups with encryption and access controls
Store offline backups to protect against ransomware

Monitoring and Logging

Enable comprehensive logging across systems
Centralize log collection and analysis (SIEM)
Set up alerts for suspicious activities
Retain logs for compliance and forensics

Conclusion

Cybersecurity is an ongoing process, not a one-time implementation. Threats evolve constantly, requiring continuous vigilance, adaptation, and improvement of security measures. Understanding these fundamentals provides a foundation for building and maintaining secure systems.
`,
  },
];

/**
 * Workflow summary
 */
interface WorkflowSummary {
  document_id: string;
  document_name: string;
  topic: string;
  parent_chunks: number;
  child_chunks: number;
  total_tokens: number;
  vectors_uploaded: number;
  duration_ms: number;
}

/**
 * Process a single test document through the full RAG workflow
 */
async function processDocument(doc: TestDocument): Promise<WorkflowSummary> {
  const startTime = Date.now();

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Processing Document: ${doc.name}`);
  console.log(`Topic: ${doc.topic} | Format: ${doc.format}`);
  console.log(`Course ID: ${doc.course_id}`);
  console.log(`${'='.repeat(80)}\n`);

  // Step 1: Chunk the markdown content
  console.log('📄 Step 1: Hierarchical chunking...');
  const chunkingResult = await chunkMarkdown(doc.content, {
    parent_chunk_size: 1500,
    child_chunk_size: 400,
    child_chunk_overlap: 50,
    tiktoken_model: 'gpt-3.5-turbo',
  });

  console.log(`  ✓ Created ${chunkingResult.metadata.parent_count} parent chunks`);
  console.log(`  ✓ Created ${chunkingResult.metadata.child_count} child chunks`);
  console.log(`  ✓ Avg parent tokens: ${chunkingResult.metadata.avg_parent_tokens}`);
  console.log(`  ✓ Avg child tokens: ${chunkingResult.metadata.avg_child_tokens}\n`);

  // Step 2: Enrich chunks with metadata
  console.log('🏷️  Step 2: Enriching chunks with metadata...');
  const enrichedChildren = enrichChunks(chunkingResult.child_chunks, {
    document_id: doc.id,
    document_name: doc.name,
    document_version: 'v1.0',
    version_hash: `hash-${doc.id}`,
    organization_id: doc.organization_id,
    course_id: doc.course_id,
  });

  console.log(`  ✓ Enriched ${enrichedChildren.length} child chunks\n`);

  // Step 3: Generate embeddings with Jina-v3
  console.log('🧠 Step 3: Generating embeddings with Jina-v3 (late chunking enabled)...');
  const embeddingResult = await generateEmbeddingsWithLateChunking(
    enrichedChildren,
    'retrieval.passage',
    true // Enable late chunking
  );

  console.log(`  ✓ Generated ${embeddingResult.embeddings.length} embeddings`);
  console.log(`  ✓ Processed ${embeddingResult.total_tokens} tokens`);
  console.log(`  ✓ Late chunking: ${embeddingResult.metadata.late_chunking_enabled}\n`);

  // Step 4: Upload to Qdrant
  console.log('⬆️  Step 4: Uploading vectors to Qdrant...');
  const uploadResult = await uploadChunksToQdrant(embeddingResult.embeddings, {
    batch_size: 100,
    enable_sparse: false, // Not using BM25 for this seed script
    collection_name: 'course_embeddings',
    wait: true,
  });

  console.log(`  ✓ Uploaded ${uploadResult.points_uploaded} vectors`);
  console.log(`  ✓ Duration: ${uploadResult.duration_ms}ms`);

  if (!uploadResult.success) {
    throw new Error(`Upload failed for ${doc.name}: ${uploadResult.error}`);
  }

  const duration = Date.now() - startTime;

  console.log(`\n✅ Document processing complete in ${duration}ms\n`);

  return {
    document_id: doc.id,
    document_name: doc.name,
    topic: doc.topic,
    parent_chunks: chunkingResult.metadata.parent_count,
    child_chunks: chunkingResult.metadata.child_count,
    total_tokens: embeddingResult.total_tokens,
    vectors_uploaded: uploadResult.points_uploaded,
    duration_ms: duration,
  };
}

/**
 * Test semantic search across all courses
 */
async function testSemanticSearch() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('🔍 Testing Semantic Search Across All Courses');
  console.log(`${'='.repeat(80)}\n`);

  const testQueries = [
    {
      query: 'How do machine learning algorithms work?',
      expected_course: COURSE_IDS.ml,
      expected_topic: 'Machine Learning',
    },
    {
      query: 'What is SQL database?',
      expected_course: COURSE_IDS.database,
      expected_topic: 'Database Design',
    },
    {
      query: 'How to protect against phishing attacks?',
      expected_course: COURSE_IDS.cybersecurity,
      expected_topic: 'Cybersecurity',
    },
    {
      query: 'What is React and how is it used?',
      expected_course: COURSE_IDS.webdev,
      expected_topic: 'Web Development',
    },
    {
      query: 'What is microservices architecture?',
      expected_course: COURSE_IDS.architecture,
      expected_topic: 'Software Architecture',
    },
  ];

  for (const test of testQueries) {
    console.log(`Query: "${test.query}"`);
    console.log(`Expected Topic: ${test.expected_topic}\n`);

    const searchResult = await searchChunks(test.query, {
      limit: 5,
      score_threshold: 0.6,
      filters: {
        organization_id: TEST_ORG_ID,
      },
    });

    if (searchResult.results.length === 0) {
      console.log('  ❌ No results found\n');
      continue;
    }

    console.log(`  📊 Found ${searchResult.results.length} results:`);
    searchResult.results.forEach((result, index) => {
      const isExpectedCourse = result.payload?.course_id === test.expected_course;
      const indicator = isExpectedCourse ? '✓' : '○';

      console.log(
        `  ${indicator} ${index + 1}. [Score: ${result.score.toFixed(3)}] ${result.heading_path}`
      );
      console.log(`     Document: ${result.document_name}`);
      console.log(`     Course ID: ${result.payload?.course_id || 'N/A'}`);
      console.log(`     Content: ${result.content.substring(0, 100)}...`);
    });

    // Check if top result is from expected course
    const topResult = searchResult.results[0];
    const topResultCourseId = topResult.payload?.course_id;

    if (topResultCourseId === test.expected_course) {
      console.log(`\n  ✅ Top result is from expected topic: ${test.expected_topic}`);
    } else {
      console.log(
        `\n  ⚠️  Top result is NOT from expected topic (got course_id: ${topResultCourseId})`
      );
    }

    console.log();
  }
}

/**
 * Display collection statistics
 */
async function displayCollectionStats() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 Qdrant Collection Statistics');
  console.log(`${'='.repeat(80)}\n`);

  const stats = await getCollectionStats('course_embeddings');

  console.log(`Total Vectors: ${stats.points_count}`);
  console.log(`Indexed Vectors: ${stats.indexed_vectors_count}`);
  console.log(`Segments: ${stats.segments_count}\n`);
}

/**
 * Main execution
 */
async function main() {
  console.log('\n🚀 Starting RAG Data Seeding Script (T083)\n');

  const summaries: WorkflowSummary[] = [];
  const overallStartTime = Date.now();

  // Process all documents
  for (const doc of TEST_DOCUMENTS) {
    try {
      const summary = await processDocument(doc);
      summaries.push(summary);
    } catch (error) {
      console.error(`❌ Failed to process document ${doc.name}:`, error);
      throw error;
    }
  }

  // Test semantic search
  await testSemanticSearch();

  // Display collection stats
  await displayCollectionStats();

  // Display overall summary
  const overallDuration = Date.now() - overallStartTime;

  console.log(`${'='.repeat(80)}`);
  console.log('📈 Overall Summary');
  console.log(`${'='.repeat(80)}\n`);

  console.log('Documents Processed:');
  summaries.forEach((s, index) => {
    console.log(`  ${index + 1}. ${s.document_name}`);
    console.log(`     Topic: ${s.topic}`);
    console.log(`     Chunks: ${s.parent_chunks} parent, ${s.child_chunks} child`);
    console.log(`     Tokens: ${s.total_tokens}`);
    console.log(`     Vectors: ${s.vectors_uploaded}`);
    console.log(`     Duration: ${s.duration_ms}ms\n`);
  });

  const totalChunks = summaries.reduce((sum, s) => sum + s.child_chunks, 0);
  const totalVectors = summaries.reduce((sum, s) => sum + s.vectors_uploaded, 0);
  const totalTokens = summaries.reduce((sum, s) => sum + s.total_tokens, 0);

  console.log('Totals:');
  console.log(`  Documents: ${summaries.length}`);
  console.log(`  Child Chunks: ${totalChunks}`);
  console.log(`  Vectors Uploaded: ${totalVectors}`);
  console.log(`  Tokens Processed: ${totalTokens}`);
  console.log(`  Total Duration: ${overallDuration}ms\n`);

  console.log('✅ RAG data seeding complete!\n');
  console.log('Next Steps:');
  console.log('  - Verify vectors in Qdrant UI: http://localhost:6333/dashboard');
  console.log('  - Test semantic search with different queries');
  console.log('  - Validate multi-tenant isolation with course_id filters\n');
}

// Run main function
if (require.main === module) {
  main()
    .then(() => {
      console.log('✅ Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { main, processDocument, testSemanticSearch };
