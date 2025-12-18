'use client'

import { useState, memo } from 'react'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useDropzone } from 'react-dropzone'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { Camera, Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { personalInfoSchema, type PersonalInfoFormData } from '../validation-schemas'
import type { UserProfile } from '../page'
import type { UserPreferences } from '@/lib/user-preferences'

interface PersonalInfoSectionProps {
  profile: UserProfile | (UserProfile & UserPreferences)
  onUpdate: (updates: Partial<UserProfile & UserPreferences>) => Promise<void>
  onAvatarUpload: (files: File[]) => Promise<void>
  uploadProgress: number
  isSaving: boolean
}

const PersonalInfoSection = memo(function PersonalInfoSection({
  profile,
  onUpdate,
  onAvatarUpload,
  uploadProgress,
  isSaving
}: PersonalInfoSectionProps) {
  const [isEditing, setIsEditing] = useState(false)

  const form = useForm<PersonalInfoFormData>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      full_name: profile.full_name || '',
      bio: profile.bio || ''
    }
  })

  const onSubmit = async (data: PersonalInfoFormData) => {
    await onUpdate(data)
    setIsEditing(false)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onAvatarUpload,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    maxSize: 5 * 1024 * 1024,
    multiple: false
  })

  const initials = profile.full_name
    ?.split(' ')
    ?.map((n: string) => n[0])
    ?.join('')
    ?.toUpperCase() ||
    profile.email
    ?.split('@')[0]
    ?.slice(0, 2)
    ?.toUpperCase() || 'U'

  return (
    <div className="space-y-6">
      {/* Avatar Upload Card with optimized image loading */}
      <Card className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow duration-300">
        <h3 className="text-lg font-semibold mb-4 text-foreground">
          Фото профиля
        </h3>
        <div className="flex items-center gap-6">
          <div
            {...getRootProps()}
            className={cn(
              "relative group cursor-pointer",
              isDragActive && "scale-105"
            )}
          >
            <input {...getInputProps()} accept="image/png,image/jpeg,image/jpg,image/webp" aria-label="Загрузить аватар" />
            <div className="h-24 w-24 avatar-ring transition-transform duration-300 group-hover:scale-105">
              <div className="h-full w-full rounded-full bg-background flex items-center justify-center overflow-hidden relative">
                {profile.avatar_url ? (
                  <div className="relative h-full w-full">
                    <Image
                      src={profile.avatar_url}
                      alt={profile.full_name || 'Profile'}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-110"
                      sizes="96px"
                      priority={false}
                      loading="lazy"
                      placeholder="blur"
                      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwABmX/9k="
                    />
                  </div>
                ) : (
                  <span className="text-2xl font-semibold gradient-text">
                    {initials}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-full flex items-center justify-center">
                  <Camera className="h-6 w-6 text-white" />
                </div>
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-full">
                    <Loader2 className="h-6 w-6 text-white animate-spin mb-1" />
                    <div className="text-white text-xs font-medium">
                      {uploadProgress}%
                    </div>
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-primary/30 transition-all duration-300"
                        style={{ height: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            {isDragActive && (
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary animate-pulse" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-2">
              Перетащите изображение или нажмите для выбора
            </p>
            <p className="text-xs text-muted-foreground">
              Поддерживаются JPG, PNG, WebP до 5MB
            </p>
          </div>
        </div>
      </Card>

      {/* Personal Info Form */}
      <Card
        className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow duration-300"
        role="region"
        aria-labelledby="personal-info-heading"
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            id="personal-info-heading"
            className="text-lg font-semibold text-foreground"
          >
            Основная информация
          </h3>
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
              aria-label="Редактировать личную информацию"
            >
              Редактировать
            </Button>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              label="Полное имя"
              error={form.formState.errors.full_name?.message}
            >
              <Input
                {...form.register('full_name')}
                placeholder="Введите ваше имя"
                id="full_name"
                aria-required="true"
                aria-invalid={!!form.formState.errors.full_name}
                aria-describedby={form.formState.errors.full_name ? "full_name_error" : undefined}
              />
              {form.formState.errors.full_name && (
                <span id="full_name_error" className="sr-only" role="alert">
                  {form.formState.errors.full_name.message}
                </span>
              )}
            </FormField>

            <FormField
              label="О себе"
              description={`${form.watch('bio')?.length || 0}/500 символов`}
              error={form.formState.errors.bio?.message}
            >
              <Textarea
                {...form.register('bio')}
                placeholder="Расскажите о себе..."
                rows={4}
                maxLength={500}
                id="bio"
                aria-describedby="bio_description bio_error"
                aria-invalid={!!form.formState.errors.bio}
              />
              <span id="bio_description" className="sr-only">
                Максимальная длина 500 символов. Использовано {form.watch('bio')?.length || 0} символов.
              </span>
              {form.formState.errors.bio && (
                <span id="bio_error" className="sr-only" role="alert">
                  {form.formState.errors.bio.message}
                </span>
              )}
            </FormField>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
                aria-busy={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Сохранить
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
                onClick={() => {
                  setIsEditing(false)
                  form.reset()
                }}
              >
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="group">
              <label className="text-sm font-medium text-muted-foreground transition-colors duration-300 group-hover:text-primary">
                Полное имя
              </label>
              <p className="mt-1 text-foreground transition-transform duration-300 group-hover:translate-x-1">
                {profile.full_name || 'Не указано'}
              </p>
            </div>
            <div className="group">
              <label className="text-sm font-medium text-muted-foreground transition-colors duration-300 group-hover:text-primary">
                Email
              </label>
              <p className="mt-1 text-foreground transition-transform duration-300 group-hover:translate-x-1">
                {profile.email}
              </p>
            </div>
            <div className="group">
              <label className="text-sm font-medium text-muted-foreground transition-colors duration-300 group-hover:text-primary">
                О себе
              </label>
              <p className="mt-1 text-muted-foreground transition-all duration-300 group-hover:translate-x-1">
                {profile.bio || 'Расскажите о себе...'}
              </p>
            </div>
            <div className="group">
              <label className="text-sm font-medium text-muted-foreground transition-colors duration-300 group-hover:text-primary">
                Дата регистрации
              </label>
              <p className="mt-1 text-foreground transition-transform duration-300 group-hover:translate-x-1">
                {profile.created_at
                  ? new Date(profile.created_at).toLocaleDateString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  : 'Не указано'
                }
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
})

export default PersonalInfoSection