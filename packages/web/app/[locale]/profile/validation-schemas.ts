import * as z from 'zod'

// Form validation schemas
export const personalInfoSchema = z.object({
  full_name: z.string().min(2, 'Имя должно содержать минимум 2 символа').max(100, 'Имя слишком длинное'),
  bio: z.string().max(500, 'Описание не должно превышать 500 символов').optional()
})

export const passwordSchema = z.object({
  current_password: z.string().min(6, 'Пароль должен содержать минимум 6 символов'),
  new_password: z.string()
    .min(8, 'Новый пароль должен содержать минимум 8 символов')
    .max(128, 'Пароль слишком длинный')
    .regex(/[A-Z]/, 'Пароль должен содержать хотя бы одну заглавную букву')
    .regex(/[a-z]/, 'Пароль должен содержать хотя бы одну строчную букву')
    .regex(/[0-9]/, 'Пароль должен содержать хотя бы одну цифру')
    .regex(/[^A-Za-z0-9]/, 'Пароль должен содержать хотя бы один специальный символ'),
  confirm_password: z.string()
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Пароли не совпадают",
  path: ["confirm_password"],
}).refine((data) => data.current_password !== data.new_password, {
  message: "Новый пароль должен отличаться от текущего",
  path: ["new_password"],
})

export type PersonalInfoFormData = z.infer<typeof personalInfoSchema>
export type PasswordFormData = z.infer<typeof passwordSchema>