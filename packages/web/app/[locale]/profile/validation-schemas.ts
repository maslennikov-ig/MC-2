import * as z from 'zod'

// Factory function for personal info schema with translations
export const createPersonalInfoSchema = (
  t: (key: string) => string
): z.ZodObject<{
  full_name: z.ZodString
  bio: z.ZodOptional<z.ZodString>
}> =>
  z.object({
    full_name: z.string().min(2, t('validation.nameMin')).max(100, t('validation.nameMax')),
    bio: z.string().max(500, t('validation.bioMax')).optional(),
  })

// Factory function for password schema with translations
export const createPasswordSchema = (
  t: (key: string) => string
): z.ZodEffects<
  z.ZodEffects<
    z.ZodObject<{
      current_password: z.ZodString
      new_password: z.ZodString
      confirm_password: z.ZodString
    }>
  >
> =>
  z
    .object({
      current_password: z.string().min(6, t('validation.passwordMin6')),
      new_password: z
        .string()
        .min(8, t('validation.passwordMin8'))
        .max(128, t('validation.passwordMax'))
        .regex(/[A-Z]/, t('validation.passwordUppercase'))
        .regex(/[a-z]/, t('validation.passwordLowercase'))
        .regex(/[0-9]/, t('validation.passwordDigit'))
        .regex(/[^A-Za-z0-9]/, t('validation.passwordSpecial')),
      confirm_password: z.string(),
    })
    .refine((data) => data.new_password === data.confirm_password, {
      message: t('validation.passwordMismatch'),
      path: ['confirm_password'],
    })
    .refine((data) => data.current_password !== data.new_password, {
      message: t('validation.passwordSameAsCurrent'),
      path: ['new_password'],
    })

// Type exports (inferred from schema created with empty translation function)
export type PersonalInfoFormData = z.infer<ReturnType<typeof createPersonalInfoSchema>>
export type PasswordFormData = z.infer<ReturnType<typeof createPasswordSchema>>
