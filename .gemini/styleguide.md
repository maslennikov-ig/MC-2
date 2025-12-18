# Gemini Code Assist Style Guide

Please review code based on the following principles:

## Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript 5.x
- **UI Library:** React 19
- **Styling:** Tailwind CSS 4
- **State Management:** React Context / Hooks
- **Icons:** Lucide React

## Coding Standards
- Use **functional components** with hooks.
- Ensure strict **TypeScript typing** (avoid `any`).
- Use **Tailwind CSS** utility classes for styling.
- Follow **server components** default in Next.js 15, use `'use client'` only when necessary.
- Prefer **Zod** for schema validation.

## Best Practices
- Keep components small and focused.
- Ensure accessibility (a11y) standards are met.
- Handle errors gracefully.
- Write clean, readable code with meaningful variable names.
