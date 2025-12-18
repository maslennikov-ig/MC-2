-- ============================================================================
-- Migration: 20250110_initial_schema.sql
-- Purpose: Establish normalized course structure with proper relationships
-- Author: database-architect
-- Date: 2025-01-10
-- ============================================================================

-- ============================================================================
-- PART 1: ENUMS
-- Define all enum types for type safety and consistency
-- ============================================================================

-- Organization tier levels with associated storage quotas
CREATE TYPE tier AS ENUM (
    'free',        -- 10 MB quota, 0 files allowed
    'basic_plus',  -- 100 MB quota, 1 file per course, PDF/TXT/MD only
    'standard',    -- 1 GB quota, 3 files per course, +DOCX/HTML/PPTX
    'premium'      -- 10 GB quota, 10 files per course, all formats
);

-- User roles for access control
CREATE TYPE role AS ENUM (
    'admin',       -- Full organization access
    'instructor',  -- Own courses + read-only org courses
    'student'      -- Enrolled courses only (read-only)
);

-- Course lifecycle states
CREATE TYPE course_status AS ENUM (
    'draft',       -- Work in progress
    'published',   -- Available for enrollment
    'archived'     -- No longer active
);

-- Lesson content types
CREATE TYPE lesson_type AS ENUM (
    'video',
    'text',
    'quiz',
    'interactive',
    'assignment'
);

-- Lesson lifecycle states
CREATE TYPE lesson_status AS ENUM (
    'draft',
    'published',
    'archived'
);

-- Vector indexing status for RAG
CREATE TYPE vector_status AS ENUM (
    'pending',     -- Awaiting indexing
    'indexing',    -- Currently being processed
    'indexed',     -- Successfully indexed
    'failed'       -- Indexing failed
);

-- Student enrollment states
CREATE TYPE enrollment_status AS ENUM (
    'active',      -- Currently enrolled
    'completed',   -- Finished course
    'dropped',     -- Voluntarily left
    'expired'      -- Access expired
);

-- ============================================================================
-- PART 2: TABLES
-- Core tables with proper normalization and relationships
-- ============================================================================

-- Organizations table (top-level tenant)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tier tier NOT NULL DEFAULT 'free',
    storage_quota_bytes BIGINT NOT NULL DEFAULT 10485760, -- 10 MB for free tier
    storage_used_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT organizations_name_unique UNIQUE (name),
    CONSTRAINT organizations_storage_check CHECK (storage_used_bytes >= 0 AND storage_used_bytes <= storage_quota_bytes),
    CONSTRAINT organizations_quota_by_tier CHECK (
        (tier = 'free' AND storage_quota_bytes = 10485760) OR          -- 10 MB
        (tier = 'basic_plus' AND storage_quota_bytes = 104857600) OR   -- 100 MB
        (tier = 'standard' AND storage_quota_bytes = 1073741824) OR    -- 1 GB
        (tier = 'premium' AND storage_quota_bytes = 10737418240)       -- 10 GB
    )
);

-- Users table with organization relationship
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT auth.uid(), -- Links to Supabase Auth
    email TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role role NOT NULL DEFAULT 'student',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT users_email_unique UNIQUE (email)
);

-- Courses table with instructor ownership
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Instructor/Owner
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status course_status NOT NULL DEFAULT 'draft',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT courses_slug_org_unique UNIQUE (organization_id, slug)
);

-- Sections for course structure
CREATE TABLE IF NOT EXISTS sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT sections_order_unique UNIQUE (course_id, order_index),
    CONSTRAINT sections_order_positive CHECK (order_index > 0)
);

-- Lessons within sections
CREATE TABLE IF NOT EXISTS lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    duration_minutes INTEGER,
    lesson_type lesson_type NOT NULL,
    status lesson_status NOT NULL DEFAULT 'draft',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT lessons_order_unique UNIQUE (section_id, order_index),
    CONSTRAINT lessons_order_positive CHECK (order_index > 0),
    CONSTRAINT lessons_duration_positive CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

-- Lesson content (separated for performance)
CREATE TABLE IF NOT EXISTS lesson_content (
    lesson_id UUID PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
    text_content TEXT,
    media_urls TEXT[],
    quiz_data JSONB,
    interactive_elements JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- File catalog for uploaded documents
CREATE TABLE IF NOT EXISTS file_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    vector_status vector_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT file_catalog_size_positive CHECK (file_size > 0)
);

-- Course enrollments for students
CREATE TABLE IF NOT EXISTS course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status enrollment_status NOT NULL DEFAULT 'active',
    completed_at TIMESTAMPTZ,
    progress JSONB DEFAULT '{"lessons_completed": [], "last_accessed": null}',

    -- Constraints
    CONSTRAINT enrollments_user_course_unique UNIQUE (user_id, course_id),
    CONSTRAINT enrollments_completed_check CHECK (
        (status = 'completed' AND completed_at IS NOT NULL) OR
        (status != 'completed' AND completed_at IS NULL)
    )
);

-- ============================================================================
-- PART 3: INDEXES
-- Performance optimization for frequently queried columns
-- ============================================================================

-- Organizations indexes
CREATE INDEX idx_organizations_tier ON organizations(tier);
CREATE INDEX idx_organizations_created_at ON organizations(created_at DESC);

-- Users indexes
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);

-- Courses indexes
CREATE INDEX idx_courses_user_id ON courses(user_id);
CREATE INDEX idx_courses_organization_id ON courses(organization_id);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_slug ON courses(slug);

-- Sections indexes
CREATE INDEX idx_sections_course_id ON sections(course_id);
CREATE INDEX idx_sections_order ON sections(course_id, order_index);

-- Lessons indexes
CREATE INDEX idx_lessons_section_id ON lessons(section_id);
CREATE INDEX idx_lessons_status ON lessons(status);
CREATE INDEX idx_lessons_type ON lessons(lesson_type);
CREATE INDEX idx_lessons_order ON lessons(section_id, order_index);

-- File catalog indexes
CREATE INDEX idx_file_catalog_organization_id ON file_catalog(organization_id);
CREATE INDEX idx_file_catalog_course_id ON file_catalog(course_id);
CREATE INDEX idx_file_catalog_vector_status ON file_catalog(vector_status);
CREATE INDEX idx_file_catalog_hash ON file_catalog(hash);

-- Course enrollments indexes
CREATE INDEX idx_enrollments_user_id ON course_enrollments(user_id);
CREATE INDEX idx_enrollments_course_id ON course_enrollments(course_id);
CREATE INDEX idx_enrollments_status ON course_enrollments(status);
CREATE INDEX idx_enrollments_enrolled_at ON course_enrollments(enrolled_at DESC);

-- ============================================================================
-- PART 4: ROW LEVEL SECURITY (RLS)
-- Enable RLS on all tables and create policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ADMIN ROLE POLICIES (Full organization access)
-- ============================================================================

-- Organizations: Admins can manage their organization
CREATE POLICY "admin_organizations_all"
    ON organizations
    FOR ALL
    TO authenticated
    USING (
        id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Users: Admins can manage all users in their organization
CREATE POLICY "admin_users_all"
    ON users
    FOR ALL
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Courses: Admins can manage all courses in their organization
CREATE POLICY "admin_courses_all"
    ON courses
    FOR ALL
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Sections: Admins can manage all sections in their organization's courses
CREATE POLICY "admin_sections_all"
    ON sections
    FOR ALL
    TO authenticated
    USING (
        course_id IN (
            SELECT id FROM courses
            WHERE organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid() AND role = 'admin'
            )
        )
    );

-- Lessons: Admins can manage all lessons in their organization
CREATE POLICY "admin_lessons_all"
    ON lessons
    FOR ALL
    TO authenticated
    USING (
        section_id IN (
            SELECT s.id FROM sections s
            JOIN courses c ON s.course_id = c.id
            WHERE c.organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid() AND role = 'admin'
            )
        )
    );

-- Lesson Content: Admins can manage all lesson content in their organization
CREATE POLICY "admin_lesson_content_all"
    ON lesson_content
    FOR ALL
    TO authenticated
    USING (
        lesson_id IN (
            SELECT l.id FROM lessons l
            JOIN sections s ON l.section_id = s.id
            JOIN courses c ON s.course_id = c.id
            WHERE c.organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid() AND role = 'admin'
            )
        )
    );

-- File Catalog: Admins can manage all files in their organization
CREATE POLICY "admin_file_catalog_all"
    ON file_catalog
    FOR ALL
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Enrollments: Admins can manage all enrollments in their organization
CREATE POLICY "admin_enrollments_all"
    ON course_enrollments
    FOR ALL
    TO authenticated
    USING (
        course_id IN (
            SELECT id FROM courses
            WHERE organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid() AND role = 'admin'
            )
        )
    );

-- ============================================================================
-- INSTRUCTOR ROLE POLICIES (Own courses + read organization courses)
-- ============================================================================

-- Organizations: Instructors can view their organization
CREATE POLICY "instructor_organizations_select"
    ON organizations
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'instructor'
        )
    );

-- Users: Instructors can view users in their organization
CREATE POLICY "instructor_users_select"
    ON users
    FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'instructor'
        )
    );

-- Courses: Instructors can manage their own courses
CREATE POLICY "instructor_courses_own"
    ON courses
    FOR ALL
    TO authenticated
    USING (
        user_id = auth.uid() AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
    );

-- Courses: Instructors can view all courses in their organization
CREATE POLICY "instructor_courses_view_org"
    ON courses
    FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'instructor'
        )
    );

-- Sections: Instructors can manage sections in their own courses
CREATE POLICY "instructor_sections_own"
    ON sections
    FOR ALL
    TO authenticated
    USING (
        course_id IN (
            SELECT id FROM courses
            WHERE user_id = auth.uid()
        ) AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
    );

-- Sections: Instructors can view sections in organization courses
CREATE POLICY "instructor_sections_view_org"
    ON sections
    FOR SELECT
    TO authenticated
    USING (
        course_id IN (
            SELECT id FROM courses
            WHERE organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid() AND role = 'instructor'
            )
        )
    );

-- Lessons: Instructors can manage lessons in their own courses
CREATE POLICY "instructor_lessons_own"
    ON lessons
    FOR ALL
    TO authenticated
    USING (
        section_id IN (
            SELECT s.id FROM sections s
            JOIN courses c ON s.course_id = c.id
            WHERE c.user_id = auth.uid()
        ) AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
    );

-- Lessons: Instructors can view lessons in organization courses
CREATE POLICY "instructor_lessons_view_org"
    ON lessons
    FOR SELECT
    TO authenticated
    USING (
        section_id IN (
            SELECT s.id FROM sections s
            JOIN courses c ON s.course_id = c.id
            WHERE c.organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid() AND role = 'instructor'
            )
        )
    );

-- Lesson Content: Instructors can manage content in their own courses
CREATE POLICY "instructor_lesson_content_own"
    ON lesson_content
    FOR ALL
    TO authenticated
    USING (
        lesson_id IN (
            SELECT l.id FROM lessons l
            JOIN sections s ON l.section_id = s.id
            JOIN courses c ON s.course_id = c.id
            WHERE c.user_id = auth.uid()
        ) AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
    );

-- Lesson Content: Instructors can view content in organization courses
CREATE POLICY "instructor_lesson_content_view_org"
    ON lesson_content
    FOR SELECT
    TO authenticated
    USING (
        lesson_id IN (
            SELECT l.id FROM lessons l
            JOIN sections s ON l.section_id = s.id
            JOIN courses c ON s.course_id = c.id
            WHERE c.organization_id IN (
                SELECT organization_id FROM users
                WHERE id = auth.uid() AND role = 'instructor'
            )
        )
    );

-- File Catalog: Instructors can manage files for their own courses
CREATE POLICY "instructor_file_catalog_own"
    ON file_catalog
    FOR ALL
    TO authenticated
    USING (
        (course_id IN (
            SELECT id FROM courses WHERE user_id = auth.uid()
        ) OR course_id IS NULL) AND
        organization_id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'instructor'
        )
    );

-- Enrollments: Instructors can view enrollments in their courses
CREATE POLICY "instructor_enrollments_view"
    ON course_enrollments
    FOR SELECT
    TO authenticated
    USING (
        course_id IN (
            SELECT id FROM courses
            WHERE user_id = auth.uid()
        ) AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
    );

-- ============================================================================
-- STUDENT ROLE POLICIES (Enrolled courses only, read-only)
-- ============================================================================

-- Organizations: Students can view their organization
CREATE POLICY "student_organizations_select"
    ON organizations
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT organization_id FROM users
            WHERE id = auth.uid() AND role = 'student'
        )
    );

-- Users: Students can view their own profile
CREATE POLICY "student_users_self"
    ON users
    FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() AND role = 'student'
    );

-- Courses: Students can view enrolled courses
CREATE POLICY "student_courses_enrolled"
    ON courses
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT course_id FROM course_enrollments
            WHERE user_id = auth.uid() AND status = 'active'
        ) AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student')
    );

-- Sections: Students can view sections in enrolled courses
CREATE POLICY "student_sections_enrolled"
    ON sections
    FOR SELECT
    TO authenticated
    USING (
        course_id IN (
            SELECT course_id FROM course_enrollments
            WHERE user_id = auth.uid() AND status = 'active'
        ) AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student')
    );

-- Lessons: Students can view lessons in enrolled courses
CREATE POLICY "student_lessons_enrolled"
    ON lessons
    FOR SELECT
    TO authenticated
    USING (
        section_id IN (
            SELECT s.id FROM sections s
            JOIN course_enrollments e ON s.course_id = e.course_id
            WHERE e.user_id = auth.uid() AND e.status = 'active'
        ) AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student')
    );

-- Lesson Content: Students can view content in enrolled courses
CREATE POLICY "student_lesson_content_enrolled"
    ON lesson_content
    FOR SELECT
    TO authenticated
    USING (
        lesson_id IN (
            SELECT l.id FROM lessons l
            JOIN sections s ON l.section_id = s.id
            JOIN course_enrollments e ON s.course_id = e.course_id
            WHERE e.user_id = auth.uid() AND e.status = 'active'
        ) AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student')
    );

-- File Catalog: Students cannot access file catalog directly
-- (Files are served through lesson content)

-- Enrollments: Students can view and update their own enrollments
CREATE POLICY "student_enrollments_own"
    ON course_enrollments
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student')
    );

CREATE POLICY "student_enrollments_update_progress"
    ON course_enrollments
    FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid() AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student')
    )
    WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'student')
    );

-- ============================================================================
-- PART 5: TRIGGER FUNCTIONS
-- Automated data management
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lesson_content_updated_at
    BEFORE UPDATE ON lesson_content
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_file_catalog_updated_at
    BEFORE UPDATE ON file_catalog
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 6: COMMENTS
-- Document the schema for future developers
-- ============================================================================

COMMENT ON TABLE organizations IS 'Top-level tenant with tier-based quotas and limits';
COMMENT ON TABLE users IS 'User accounts linked to Supabase Auth with role-based access';
COMMENT ON TABLE courses IS 'Course entities owned by instructors within organizations';
COMMENT ON TABLE sections IS 'Logical groupings within courses for content organization';
COMMENT ON TABLE lessons IS 'Individual learning units within sections';
COMMENT ON TABLE lesson_content IS 'Heavy content separated from lesson metadata for performance';
COMMENT ON TABLE file_catalog IS 'Uploaded files with RAG vector status tracking';
COMMENT ON TABLE course_enrollments IS 'Student course access and progress tracking';

COMMENT ON COLUMN organizations.tier IS 'Subscription tier determining features and quotas';
COMMENT ON COLUMN organizations.storage_quota_bytes IS 'Max storage in bytes based on tier';
COMMENT ON COLUMN users.role IS 'Access control role: admin, instructor, or student';
COMMENT ON COLUMN courses.slug IS 'URL-friendly identifier unique per organization';
COMMENT ON COLUMN file_catalog.vector_status IS 'RAG indexing status for semantic search';
COMMENT ON COLUMN course_enrollments.progress IS 'JSON tracking lesson completion and access';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================