export function isStage6CourseAuditEnabled(): boolean {
  return process.env.FEATURE_STAGE6_COURSE_AUDIT === 'true';
}

export function isStage6PresentationCriticEnabled(): boolean {
  return process.env.FEATURE_STAGE6_PRESENTATION_CRITIC === 'true';
}

export function isStage6QualityAlertsEnabled(): boolean {
  return process.env.FEATURE_STAGE6_QUALITY_ALERTS === 'true';
}
