/**
 * NotebookLM Bridge Client
 * @module stages/stage7-enrichments/services/notebooklm-bridge-client
 *
 * HTTP client for calling an internal NotebookLM bridge service.
 * Used by Stage 7 NLM handlers for final audio/video artifact generation.
 */

export * from './notebooklm-bridge-client/constants.js';
export * from './notebooklm-bridge-client/types.js';
export * from './notebooklm-bridge-client/config.js';
export * from './notebooklm-bridge-client/payload-utils.js';
export * from './notebooklm-bridge-client/network.js';
export * from './notebooklm-bridge-client/client.js';
