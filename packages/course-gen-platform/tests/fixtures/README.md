# Test Data Fixtures

This directory contains test data seeding scripts for database validation and integration testing.

## Overview

The `seed-database.ts` script creates comprehensive test data across all database tables with:

- 4 Organizations (one per tier: free, basic_plus, standard, premium)
- 12 Users (4 admins, 4 instructors, 4 students)
- 4 Courses (one per organization)
- 8 Sections (2 per course)
- 16 Lessons (2 per section)
- 16 Lesson Content entries
- Variable File Catalog entries based on tier
- 4 Course Enrollments (students to courses)

## Usage

### Prerequisites

Ensure you have the following environment variables in your `.env` file:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Command Line Usage

```bash
# Seed the database with test data
pnpm seed

# Clean all test data from database
pnpm seed:clean

# Using the shell script
./tests/fixtures/run-seed.sh        # Seed data
./tests/fixtures/run-seed.sh clean  # Clean data

# Direct execution
tsx tests/fixtures/seed-database.ts        # Seed
tsx tests/fixtures/seed-database.ts clean  # Clean
```

### Programmatic Usage

```typescript
import { seedDatabase, cleanDatabase } from './tests/fixtures/seed-database';

// Seed the database
const result = await seedDatabase();
if (result.success) {
  console.log('Seeded:', result.summary);
}

// Clean the database
const cleanResult = await cleanDatabase();
if (cleanResult.success) {
  console.log('Database cleaned');
}
```

## Test Data Structure

### Organizations

| Tier       | Storage Quota | File Limits                  |
| ---------- | ------------- | ---------------------------- |
| Free       | 10 MB         | 0 files (uploads prohibited) |
| Basic Plus | 100 MB        | 1 PDF file                   |
| Standard   | 1 GB          | 3 files (PDF, DOCX, HTML)    |
| Premium    | 10 GB         | 10 files (all formats)       |

### User Roles

Each organization has:

- 1 Admin (manages organization)
- 1 Instructor (owns courses)
- 1 Student (enrolled in courses)

### Course Structure

Each course contains:

- 2 Sections: "Introduction" and "Advanced Topics"
- 4 Lessons total (2 per section)
- Types: "text" (30 min) and "interactive" (45 min)

### File Catalog

Files are created based on organization tier:

- **Free**: No files
- **Basic Plus**: 1 PDF (~2 MB)
- **Standard**: 3 files (PDF, DOCX, HTML) (~4.7 MB total)
- **Premium**: 10 files including images (~23 MB total)

## Testing

Run the test suite to validate seeding functionality:

```bash
# Run fixture tests
pnpm test:fixtures

# Run all tests including fixtures
pnpm test
```

## Features

### Error Handling

- Comprehensive error messages for debugging
- Automatic rollback on failure
- Foreign key integrity validation

### Data Consistency

- Maintains referential integrity
- Respects tier-specific constraints
- Updates storage usage calculations

### CLI Support

- Color-coded output for better readability
- Progress indicators for each operation
- Summary statistics on completion

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   - Ensure `.env` file exists with required Supabase credentials
   - Use service role key for bypassing RLS

2. **Foreign Key Violations**
   - Script inserts data in dependency order
   - Check if manual data exists that conflicts

3. **Storage Quota Exceeded**
   - File sizes are pre-calculated per tier
   - Verify organization quotas match expected values

4. **Rollback Failures**
   - Some data may remain if rollback fails
   - Use `pnpm seed:clean` to force cleanup

## Development

### Adding New Test Data

1. Update type interfaces in `seed-database.ts`
2. Add generation function following pattern
3. Update `insertData()` with new table
4. Add rollback logic in reverse order
5. Update test coverage in `seed-database.test.ts`

### Modifying Existing Data

1. Update generation functions
2. Ensure foreign key relationships remain valid
3. Update file size calculations if needed
4. Run tests to verify changes
