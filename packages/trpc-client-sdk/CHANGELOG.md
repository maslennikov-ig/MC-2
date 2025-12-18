# Changelog

All notable changes to the @megacampus/trpc-client-sdk package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-10-16

### Added

#### Core Functionality
- Initial release of tRPC client SDK
- `createMegaCampusClient()` factory function for creating type-safe clients
- Full TypeScript support with generic router type parameter
- Support for all 11 API endpoints across 4 routers:
  - Generation router (3 endpoints)
  - Jobs router (3 endpoints)
  - Admin router (3 endpoints)
  - Billing router (2 endpoints)

#### Authentication
- JWT token authentication support
- Automatic Authorization header injection
- Custom headers support
- Compatible with Supabase Auth

#### Error Handling
- 8 error handling utility functions:
  - `isTRPCError()` - Type guard for tRPC errors
  - `getErrorMessage()` - Extract user-friendly error messages
  - `getErrorCode()` - Get tRPC error codes
  - `isAuthError()` - Check for authentication errors
  - `isPermissionError()` - Check for authorization errors
  - `isValidationError()` - Check for validation errors
  - `isNotFoundError()` - Check for not found errors
  - `createAuthHeader()` - Create Authorization headers

#### Performance Features
- Request batching enabled by default
- Configurable timeout with AbortController
- Optional debug logging
- Efficient header management

#### Type Safety
- Full type inference with AppRouter generic
- Exported types for UserContext, error codes, and configurations
- Type guards for safe error handling
- Proper peer dependencies for @trpc/client

#### Documentation
- Comprehensive README.md (16.7 KB)
  - Installation instructions
  - Quick start guide
  - Authentication examples
  - API reference for all endpoints
  - Error handling patterns
  - React integration examples
  - Node.js usage examples
  - TypeScript type inference guides
- EXAMPLES.md with 50+ practical code examples
  - React hooks and components
  - Node.js scripts
  - CLI tools
  - Error handling patterns
  - Type-safe wrappers

#### Package Configuration
- Properly configured for npm publishing
- `.npmignore` for clean package contents
- `prepublishOnly` script ensures build before publish
- Repository, bugs, and homepage URLs
- Keywords for npm discoverability
- Peer dependencies properly declared

### Technical Details

- **Dependencies**:
  - `@trpc/client@^11.0.0-rc.364`
  - `@trpc/server@^11.6.0`

- **Build Output**:
  - Compiled JavaScript with source maps
  - TypeScript definitions with declaration maps
  - Total package size: ~11 KB (compressed)

- **Node.js Support**: >= 18.0.0

### MCP Integration

- Used Context7 to reference tRPC 11.x documentation
- Followed official tRPC patterns for vanilla client setup
- Implemented batching and fetch configuration per tRPC best practices

---

## Release Notes

### Version 0.3.0 - Initial Public Release

This is the first official release of the MegaCampusAI tRPC client SDK. The SDK is production-ready and provides:

1. **Complete API Coverage**: All 11 endpoints across 4 routers
2. **Type Safety**: Full TypeScript support with generics and type inference
3. **Authentication**: Built-in JWT support compatible with Supabase Auth
4. **Error Handling**: Comprehensive utilities for handling all error scenarios
5. **Developer Experience**: Extensive documentation and 50+ code examples
6. **Performance**: Request batching and configurable timeouts
7. **npm Ready**: Properly configured for publishing to npm registry

### Breaking Changes
- None (initial release)

### Known Limitations
- WebSocket subscriptions not yet supported (planned for future release)
- No automatic token refresh (must be handled by consumer)
- No built-in retry logic (planned for future release)

### Migration Guide
- Not applicable (initial release)

---

## Future Roadmap

### Version 0.4.0 (Planned)
- WebSocket support for real-time subscriptions
- Automatic token refresh helpers
- Request/response interceptors
- React Query integration helpers

### Version 0.6.0 (Planned)
- Automatic retry with exponential backoff
- Request deduplication
- Offline support with request queuing
- Enhanced debug mode with request/response logging

### Version 1.0.0 (Planned)
- Stable API with semver guarantees
- Performance optimizations
- Comprehensive test suite
- Example projects and starter templates

---

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/megacampus/megacampus2/issues
- Documentation: https://docs.megacampus.ai
- Email: support@megacampus.ai

---

**Maintained by**: MegaCampusAI Team
**License**: UNLICENSED (Proprietary)
