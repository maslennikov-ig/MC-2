/**
 * Open edX LMS Integration Module
 * @module integrations/lms/openedx
 *
 * Complete Open edX integration including:
 * - OpenEdXAdapter (LMS adapter implementation)
 * - OLX generation and packaging
 * - API client and status polling
 *
 * @example
 * ```typescript
 * import { OpenEdXAdapter } from './openedx';
 *
 * const adapter = new OpenEdXAdapter({
 *   instanceId: 'uuid',
 *   name: 'Production',
 *   type: 'openedx',
 *   organization: 'MegaCampus',
 *   lmsUrl: 'https://lms.example.com',
 *   cmsUrl: 'https://studio.example.com',
 *   clientId: 'client-id',
 *   clientSecret: 'secret',
 *   timeout: 300000,
 *   maxRetries: 3,
 *   pollInterval: 5000,
 *   enabled: true,
 *   autoCreateCourse: true,
 * });
 *
 * const result = await adapter.publishCourse(courseInput);
 * ```
 */

// Adapter implementation
export { OpenEdXAdapter } from './adapter';

// API module (client, poller, auth, types)
export * from './api';

// OLX module (generator, packager, validators, templates, types)
export * from './olx';
