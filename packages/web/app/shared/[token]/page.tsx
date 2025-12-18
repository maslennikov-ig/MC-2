import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

interface PageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function SharedCoursePage({ params }: PageProps) {
  const { token } = await params;

  // Validate token format (share_xxx format)
  if (!token || (!token.startsWith('share_') && token.length < 10)) {
    notFound();
  }

  const supabase = await createClient();

  // Find course by share_token
  const { data: course, error } = await supabase
    .from('courses')
    .select('id, slug, status, share_token, is_published')
    .eq('share_token', token)
    .single();

  if (error || !course) {
    // Add delay to prevent brute force attacks
    await new Promise(resolve => setTimeout(resolve, 1000));
    notFound();
  }

  // Check if course is ready to view
  if (course.status === 'draft' || course.is_published === false) {
    notFound();
  }

  // Redirect to the actual course page using slug or fallback to id
  // The course page will handle the display based on user auth status
  const courseIdentifier = course.slug || course.id;
  redirect(`/courses/${courseIdentifier}`);
}

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;

  const supabase = await createClient();

  const { data: course } = await supabase
    .from('courses')
    .select('title, course_description')
    .eq('share_token', token)
    .single();

  if (!course) {
    return {
      title: 'Курс не найден',
    };
  }

  return {
    title: course.title,
    description: course.course_description || `Публичный доступ к курсу "${course.title}"`,
    openGraph: {
      title: course.title,
      description: course.course_description || `Публичный доступ к курсу "${course.title}"`,
      type: 'website',
    },
  };
}