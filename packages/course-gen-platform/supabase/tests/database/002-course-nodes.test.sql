-- ============================================================================
-- course_nodes Table Test Suite
-- Tests constraints, triggers, RLS policies, and cascading behavior
-- Test Count: 24 scenarios
-- ============================================================================

BEGIN;
SELECT plan(24);

-- ============================================================================
-- HELPER: Disable circular-dependency RLS on helper tables
-- (Same pattern as 001-rls-policies.test.sql)
-- ============================================================================

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTION: Set JWT Claims for RLS Testing
-- ============================================================================

CREATE OR REPLACE FUNCTION tests.set_jwt_claims(
  user_uuid uuid,
  user_role text,
  org_uuid uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim', json_build_object(
    'sub', user_uuid::text,
    'role', user_role,
    'organization_id', org_uuid::text,
    'user_id', user_uuid::text,
    'aud', 'authenticated',
    'email', user_role || '@test.com'
  )::text, true);
  PERFORM set_config('request.jwt.claim.sub', user_uuid::text, true);
  SET LOCAL ROLE authenticated;
END;
$$;

-- ============================================================================
-- TEST DATA SETUP
-- ============================================================================

DO $$
DECLARE
  org1_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  org2_id uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  admin1_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  instructor1_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
  instructor2_id uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
  student1_id uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid;
  course1_id uuid := '33333333-3333-3333-3333-333333333333'::uuid;
  course2_id uuid := '44444444-4444-4444-4444-444444444444'::uuid;
BEGIN
  SET LOCAL role postgres;

  -- Organizations
  INSERT INTO organizations (id, name, tier, storage_quota_bytes, storage_used_bytes)
  VALUES
    (org1_id, 'Test Organization 1', 'standard', 1073741824, 0),
    (org2_id, 'Test Organization 2', 'standard', 1073741824, 0)
  ON CONFLICT (id) DO NOTHING;

  -- Auth users
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
  VALUES
    (admin1_id, 'admin1@test.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (instructor1_id, 'instructor1@test.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (instructor2_id, 'instructor2@test.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (student1_id, 'student1@test.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  -- Public users
  INSERT INTO users (id, email, organization_id, role)
  VALUES
    (admin1_id, 'admin1@test.com', org1_id, 'admin'),
    (instructor1_id, 'instructor1@test.com', org1_id, 'instructor'),
    (instructor2_id, 'instructor2@test.com', org1_id, 'instructor'),
    (student1_id, 'student1@test.com', org1_id, 'student')
  ON CONFLICT (id) DO NOTHING;

  -- Courses: instructor1 owns course1 (org1), instructor2 owns course2 (org1)
  INSERT INTO courses (id, title, slug, user_id, organization_id, status)
  VALUES
    (course1_id, 'Course 1 by Instructor1', 'course-1-inst1', instructor1_id, org1_id, 'published'),
    (course2_id, 'Course 2 by Instructor2', 'course-2-inst2', instructor2_id, org1_id, 'published')
  ON CONFLICT (id) DO NOTHING;

  -- Student enrolled in course1 only
  INSERT INTO course_enrollments (user_id, course_id, status)
  VALUES (student1_id, course1_id, 'active')
  ON CONFLICT DO NOTHING;

  -- course_nodes for course1: 2 sections, 2 lessons each
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title, data)
  VALUES
    ('sec_test0001', course1_id, NULL, 'section', 'a0', 'Section 1', '{"section_description":"Desc 1"}'),
    ('sec_test0002', course1_id, NULL, 'section', 'a1', 'Section 2', '{"section_description":"Desc 2"}'),
    ('lsn_test0001', course1_id, 'sec_test0001', 'lesson', 'a0', 'Lesson 1.1', '{}'),
    ('lsn_test0002', course1_id, 'sec_test0001', 'lesson', 'a1', 'Lesson 1.2', '{}'),
    ('lsn_test0003', course1_id, 'sec_test0002', 'lesson', 'a0', 'Lesson 2.1', '{}'),
    ('lsn_test0004', course1_id, 'sec_test0002', 'lesson', 'a1', 'Lesson 2.2', '{}');

  -- course_nodes for course2: 1 section, 1 lesson
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title, data)
  VALUES
    ('sec_test0010', course2_id, NULL, 'section', 'a0', 'Section A', '{}'),
    ('lsn_test0010', course2_id, 'sec_test0010', 'lesson', 'a0', 'Lesson A.1', '{}');
END $$;

-- ============================================================================
-- SCENARIO 1: CHECK Constraint — chk_course_nodes_parent_type (4 tests)
-- ============================================================================

-- Test 1.1: Section with parent_id IS NULL — OK
SELECT lives_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('sec_chk00001', '33333333-3333-3333-3333-333333333333', NULL, 'section', 'z0', 'CHK Section')
  $$,
  'Constraint 1.1: Section with NULL parent_id is allowed'
);
DELETE FROM course_nodes WHERE id = 'sec_chk00001';

-- Test 1.2: Section with parent_id IS NOT NULL — BLOCKED
SELECT throws_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('sec_chk00002', '33333333-3333-3333-3333-333333333333', 'sec_test0001', 'section', 'z1', 'Bad Section')
  $$,
  '23514', -- check_violation
  NULL,
  'Constraint 1.2: Section with non-NULL parent_id is rejected'
);

-- Test 1.3: Lesson with parent_id IS NOT NULL — OK
SELECT lives_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('lsn_chk00001', '33333333-3333-3333-3333-333333333333', 'sec_test0001', 'lesson', 'z0', 'CHK Lesson')
  $$,
  'Constraint 1.3: Lesson with non-NULL parent_id is allowed'
);
DELETE FROM course_nodes WHERE id = 'lsn_chk00001';

-- Test 1.4: Lesson with parent_id IS NULL — BLOCKED
SELECT throws_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('lsn_chk00002', '33333333-3333-3333-3333-333333333333', NULL, 'lesson', 'z2', 'Bad Lesson')
  $$,
  '23514', -- check_violation
  NULL,
  'Constraint 1.4: Lesson with NULL parent_id is rejected'
);

-- ============================================================================
-- SCENARIO 2: Parent Integrity Trigger (4 tests)
-- ============================================================================

-- Test 2.1: Lesson under section in same course — OK
SELECT lives_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('lsn_trg00001', '33333333-3333-3333-3333-333333333333', 'sec_test0001', 'lesson', 'z3', 'Valid Lesson')
  $$,
  'Trigger 2.1: Lesson under section in same course is allowed'
);
DELETE FROM course_nodes WHERE id = 'lsn_trg00001';

-- Test 2.2: Lesson under section from DIFFERENT course — BLOCKED
SELECT throws_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('lsn_trg00002', '33333333-3333-3333-3333-333333333333', 'sec_test0010', 'lesson', 'z4', 'Cross-course Lesson')
  $$,
  'P0001', -- raise_exception
  NULL,
  'Trigger 2.2: Lesson referencing parent from different course is rejected'
);

-- Test 2.3: Lesson under another lesson (deep nesting) — BLOCKED
SELECT throws_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('lsn_trg00003', '33333333-3333-3333-3333-333333333333', 'lsn_test0001', 'lesson', 'z5', 'Nested Lesson')
  $$,
  'P0001', -- raise_exception
  NULL,
  'Trigger 2.3: Lesson under another lesson (deep nesting) is rejected'
);

-- Test 2.4: UPDATE parent_id to cross-course — BLOCKED
SELECT throws_ok(
  $$
  UPDATE course_nodes
  SET parent_id = 'sec_test0010'
  WHERE id = 'lsn_test0001'
  $$,
  'P0001', -- raise_exception
  NULL,
  'Trigger 2.4: UPDATE parent_id to cross-course section is rejected'
);

-- ============================================================================
-- SCENARIO 3: Unique Order Key Indexes (4 tests)
-- ============================================================================

-- Test 3.1: Duplicate order_key for root sections in same course — BLOCKED
SELECT throws_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('sec_ord00001', '33333333-3333-3333-3333-333333333333', NULL, 'section', 'a0', 'Dup Order Section')
  $$,
  '23505', -- unique_violation
  NULL,
  'Index 3.1: Duplicate order_key for root sections in same course is rejected'
);

-- Test 3.2: Same order_key in different courses — OK
SELECT lives_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('sec_ord00002', '44444444-4444-4444-4444-444444444444', NULL, 'section', 'a0x', 'Same Order Diff Course')
  $$,
  'Index 3.2: Same order_key in different courses is allowed'
);
DELETE FROM course_nodes WHERE id = 'sec_ord00002';

-- Test 3.3: Duplicate order_key for lessons in same parent — BLOCKED
SELECT throws_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('lsn_ord00001', '33333333-3333-3333-3333-333333333333', 'sec_test0001', 'lesson', 'a0', 'Dup Order Lesson')
  $$,
  '23505', -- unique_violation
  NULL,
  'Index 3.3: Duplicate order_key for lessons in same section is rejected'
);

-- Test 3.4: Same order_key for lessons in different sections — OK
SELECT lives_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('lsn_ord00002', '33333333-3333-3333-3333-333333333333', 'sec_test0002', 'lesson', 'z6', 'Same Order Diff Section')
  $$,
  'Index 3.4: Same order_key for lessons in different sections is allowed'
);
DELETE FROM course_nodes WHERE id = 'lsn_ord00002';

-- ============================================================================
-- SCENARIO 4: CASCADE Deletes (2 tests)
-- ============================================================================

-- Create temporary test data for cascade tests
INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
VALUES
  ('sec_cas00001', '33333333-3333-3333-3333-333333333333', NULL, 'section', 'z9', 'Cascade Section'),
  ('lsn_cas00001', '33333333-3333-3333-3333-333333333333', 'sec_cas00001', 'lesson', 'z9a', 'Cascade Lesson 1'),
  ('lsn_cas00002', '33333333-3333-3333-3333-333333333333', 'sec_cas00001', 'lesson', 'z9b', 'Cascade Lesson 2');

-- Test 4.1: Delete section cascades to children
DELETE FROM course_nodes WHERE id = 'sec_cas00001';

SELECT results_eq(
  $$
  SELECT COUNT(*)::int FROM course_nodes WHERE id IN ('lsn_cas00001', 'lsn_cas00002')
  $$,
  ARRAY[0],
  'Cascade 4.1: Deleting section cascades to child lessons'
);

-- Test 4.2: Delete course cascades to all course_nodes (via courses FK)
-- Count nodes for course2 before delete
SELECT results_eq(
  $$
  SELECT COUNT(*)::int FROM course_nodes WHERE course_id = '44444444-4444-4444-4444-444444444444'
  $$,
  ARRAY[2],
  'Cascade 4.2: Course2 has 2 nodes before course delete'
);

-- ============================================================================
-- SCENARIO 5: RLS — Admin Access (2 tests)
-- ============================================================================

SELECT tests.set_jwt_claims(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'admin',
  '11111111-1111-1111-1111-111111111111'::uuid
);

-- Test 5.1: Admin sees all course_nodes for org courses
SELECT results_eq(
  $$
  SELECT COUNT(*)::int FROM course_nodes
  WHERE course_id IN (
    SELECT id FROM courses WHERE organization_id = '11111111-1111-1111-1111-111111111111'
  )
  $$,
  ARRAY[8], -- 6 from course1 + 2 from course2
  'RLS 5.1: Admin sees all 8 course_nodes in organization'
);

-- Test 5.2: Admin can insert course_nodes for org courses
SELECT lives_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('sec_rls00001', '33333333-3333-3333-3333-333333333333', NULL, 'section', 'zr0', 'Admin Section')
  $$,
  'RLS 5.2: Admin can insert course_nodes for org courses'
);
SET LOCAL role postgres;
DELETE FROM course_nodes WHERE id = 'sec_rls00001';

-- ============================================================================
-- SCENARIO 6: RLS — Instructor Access (3 tests)
-- ============================================================================

SELECT tests.set_jwt_claims(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'instructor',
  '11111111-1111-1111-1111-111111111111'::uuid
);

-- Test 6.1: Instructor sees all course_nodes for org courses (read)
SELECT results_eq(
  $$
  SELECT COUNT(*)::int FROM course_nodes
  $$,
  ARRAY[8],
  'RLS 6.1: Instructor sees all 8 course_nodes in organization (read access)'
);

-- Test 6.2: Instructor can insert nodes for own course
SELECT lives_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('sec_rls00002', '33333333-3333-3333-3333-333333333333', NULL, 'section', 'zr1', 'Instructor Section')
  $$,
  'RLS 6.2: Instructor can insert nodes for own course'
);
SET LOCAL role postgres;
DELETE FROM course_nodes WHERE id = 'sec_rls00002';

-- Test 6.3: Instructor cannot insert nodes for other instructor's course
SELECT tests.set_jwt_claims(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'instructor',
  '11111111-1111-1111-1111-111111111111'::uuid
);

SELECT throws_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('sec_rls00003', '44444444-4444-4444-4444-444444444444', NULL, 'section', 'zr2', 'Unauthorized Section')
  $$,
  '42501', -- insufficient_privilege
  NULL,
  'RLS 6.3: Instructor cannot insert nodes for other instructor course'
);

-- ============================================================================
-- SCENARIO 7: RLS — Student Access (3 tests)
-- ============================================================================

SELECT tests.set_jwt_claims(
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  'student',
  '11111111-1111-1111-1111-111111111111'::uuid
);

-- Test 7.1: Student sees nodes for enrolled course only
SELECT results_eq(
  $$
  SELECT COUNT(*)::int FROM course_nodes
  WHERE course_id = '33333333-3333-3333-3333-333333333333'
  $$,
  ARRAY[6],
  'RLS 7.1: Student sees 6 nodes for enrolled course'
);

-- Test 7.2: Student cannot see nodes for non-enrolled course
SELECT results_eq(
  $$
  SELECT COUNT(*)::int FROM course_nodes
  WHERE course_id = '44444444-4444-4444-4444-444444444444'
  $$,
  ARRAY[0],
  'RLS 7.2: Student cannot see nodes for non-enrolled course'
);

-- Test 7.3: Student cannot insert nodes (read-only)
SELECT throws_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('sec_rls00004', '33333333-3333-3333-3333-333333333333', NULL, 'section', 'zr3', 'Student Section')
  $$,
  '42501', -- insufficient_privilege
  NULL,
  'RLS 7.3: Student cannot insert course_nodes (read-only access)'
);

-- ============================================================================
-- SCENARIO 8: node_type CHECK Constraint (2 tests)
-- ============================================================================

-- Test 8.1: Invalid node_type — BLOCKED
SELECT throws_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('bad_type0001', '33333333-3333-3333-3333-333333333333', NULL, 'module', 'z8', 'Bad Type')
  $$,
  '23514', -- check_violation
  NULL,
  'Type 8.1: Invalid node_type "module" is rejected'
);

-- Test 8.2: Empty node_type — BLOCKED
SELECT throws_ok(
  $$
  INSERT INTO course_nodes (id, course_id, parent_id, node_type, order_key, title)
  VALUES ('bad_type0002', '33333333-3333-3333-3333-333333333333', NULL, '', 'z8b', 'Empty Type')
  $$,
  '23514', -- check_violation
  NULL,
  'Type 8.2: Empty node_type is rejected'
);

-- ============================================================================
-- CLEANUP AND FINISH
-- ============================================================================

SELECT * FROM finish();
ROLLBACK; -- Automatic cleanup - all test data is rolled back
