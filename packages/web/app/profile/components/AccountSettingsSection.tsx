'use client'

import { useState, memo, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useThemeSync } from '@/lib/hooks/use-theme-sync'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group' // Replaced with custom buttons
import { FormField } from '@/components/ui/form-field'
import {
  Lock, Download, Trash2, Moon, Sun,
  Loader2, AlertTriangle
} from 'lucide-react'
import { passwordSchema, type PasswordFormData } from '../validation-schemas'
import type { UserProfile } from '../page'
import type { UserPreferences } from '@/lib/user-preferences'

// Lazy load heavy components
const Select = dynamic(() => import('@/components/ui/select').then(mod => ({
  default: mod.Select
})), { ssr: false })
const SelectContent = dynamic(() => import('@/components/ui/select').then(mod => ({
  default: mod.SelectContent
})))
const SelectItem = dynamic(() => import('@/components/ui/select').then(mod => ({
  default: mod.SelectItem
})))
const SelectTrigger = dynamic(() => import('@/components/ui/select').then(mod => ({
  default: mod.SelectTrigger
})))
const SelectValue = dynamic(() => import('@/components/ui/select').then(mod => ({
  default: mod.SelectValue
})))

const Switch = dynamic(() => import('@/components/ui/switch').then(mod => ({
  default: mod.Switch
})), { ssr: false })

const Dialog = dynamic(() => import('@/components/ui/dialog').then(mod => ({
  default: mod.Dialog
})))
const DialogContent = dynamic(() => import('@/components/ui/dialog').then(mod => ({
  default: mod.DialogContent
})))
const DialogDescription = dynamic(() => import('@/components/ui/dialog').then(mod => ({
  default: mod.DialogDescription
})))
const DialogFooter = dynamic(() => import('@/components/ui/dialog').then(mod => ({
  default: mod.DialogFooter
})))
const DialogHeader = dynamic(() => import('@/components/ui/dialog').then(mod => ({
  default: mod.DialogHeader
})))
const DialogTitle = dynamic(() => import('@/components/ui/dialog').then(mod => ({
  default: mod.DialogTitle
})))
const DialogTrigger = dynamic(() => import('@/components/ui/dialog').then(mod => ({
  default: mod.DialogTrigger
})))

interface AccountSettingsSectionProps {
  profile: UserProfile | (UserProfile & UserPreferences)
  onUpdate: (updates: Partial<UserProfile & UserPreferences>) => Promise<void>
  isSaving: boolean
  onExportData: () => void
  onDeleteAccount: () => Promise<void>
}

const AccountSettingsSection = memo(function AccountSettingsSection({
  profile,
  onUpdate,
  isSaving,
  onExportData,
  onDeleteAccount
}: AccountSettingsSectionProps) {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const { theme, setTheme } = useThemeSync()

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: ''
    }
  })

  const handlePasswordSubmit = async () => {
    // In production, this would call the backend API
    toast.success('Пароль успешно изменен')
    setShowPasswordForm(false)
    passwordForm.reset()
  }

  return (
    <div className="space-y-6">
      {/* Theme & Language Settings */}
      <Card className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow duration-300">
        <h3 className="text-lg font-semibold mb-4 text-foreground">
          Настройки интерфейса
        </h3>
        <div className="space-y-4">
          <div>
            <Label>Тема оформления</Label>
            <div className="mt-2 flex gap-4">
              <button
                type="button"
                onClick={async () => {
                  setTheme('light')
                  // Also update in the database
                  await onUpdate({ theme_preference: 'light' })
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                  theme === 'light'
                    ? 'border-purple-600 bg-purple-50 text-purple-900 dark:bg-purple-900/20 dark:text-purple-100'
                    : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
                }`}
                aria-label="Светлая тема"
              >
                <Sun className="h-4 w-4" />
                Светлая
              </button>
              <button
                type="button"
                onClick={async () => {
                  setTheme('dark')
                  // Also update in the database
                  await onUpdate({ theme_preference: 'dark' })
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                  theme === 'dark'
                    ? 'border-purple-600 bg-purple-50 text-purple-900 dark:bg-purple-900/20 dark:text-purple-100'
                    : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
                }`}
                aria-label="Темная тема"
              >
                <Moon className="h-4 w-4" />
                Темная
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="language">Язык интерфейса</Label>
            <Suspense fallback={<div className="h-10 w-full bg-muted animate-pulse rounded-md mt-2" />}>
              <Select
                value={'language' in profile ? profile.language : 'ru'}
                onValueChange={(value) => onUpdate({ language: value })}
                aria-label="Выбор языка интерфейса"
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">Русский</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                </SelectContent>
              </Select>
            </Suspense>
          </div>
        </div>
      </Card>

      {/* Notification Settings */}
      <Card className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow duration-300">
        <h3 className="text-lg font-semibold mb-4 text-foreground">
          Уведомления
        </h3>
        <div className="space-y-0 divide-y divide-border">
          <Suspense fallback={<div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}</div>}>
            <div className="flex items-center justify-between py-4 first:pt-0">
              <div className="space-y-0.5">
                <Label htmlFor="email-notifications">Email уведомления</Label>
                <p className="text-sm text-muted-foreground" id="email-notifications-description">
                  Получать уведомления на email
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={'email_notifications' in profile ? profile.email_notifications : true}
                onCheckedChange={(checked) => onUpdate({ email_notifications: checked })}
                aria-label="Получать уведомления на email"
                aria-describedby="email-notifications-description"
              />
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label htmlFor="course-updates">Обновления курсов</Label>
                <p className="text-sm text-muted-foreground">
                  Обновления ваших курсов
                </p>
              </div>
              <Switch
                id="course-updates"
                checked={'email_course_updates' in profile ? profile.email_course_updates : true}
                onCheckedChange={(checked) => onUpdate({ email_course_updates: checked })}
              />
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label htmlFor="push-notifications">Push уведомления</Label>
                <p className="text-sm text-muted-foreground">
                  Уведомления в браузере
                </p>
              </div>
              <Switch
                id="push-notifications"
                checked={'push_notifications' in profile ? profile.push_notifications : false}
                onCheckedChange={(checked) => onUpdate({ push_notifications: checked })}
              />
            </div>
          </Suspense>
        </div>
      </Card>

      {/* Privacy Settings */}
      <Card className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow duration-300">
        <h3 className="text-lg font-semibold mb-4 text-foreground">
          Конфиденциальность
        </h3>
        <div className="space-y-0 divide-y divide-border">
          <Suspense fallback={<div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}</div>}>
            <div className="flex items-center justify-between py-4 first:pt-0">
              <div className="space-y-0.5">
                <Label htmlFor="profile-visibility">Публичный профиль</Label>
                <p className="text-sm text-muted-foreground">
                  Разрешить другим видеть ваш профиль
                </p>
              </div>
              <Switch
                id="profile-visibility"
                checked={'profile_visibility' in profile ? profile.profile_visibility === 'public' : true}
                onCheckedChange={(checked) => onUpdate({ profile_visibility: checked ? 'public' : 'private' })}
              />
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label htmlFor="show-achievements">Показывать достижения</Label>
                <p className="text-sm text-muted-foreground">
                  Отображать ваши достижения в профиле
                </p>
              </div>
              <Switch
                id="show-achievements"
                checked={'show_achievements' in profile ? profile.show_achievements : true}
                onCheckedChange={(checked) => onUpdate({ show_achievements: checked })}
              />
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label htmlFor="data-collection">Сбор данных</Label>
                <p className="text-sm text-muted-foreground">
                  Помогать улучшать сервис
                </p>
              </div>
              <Switch
                id="data-collection"
                checked={'data_collection' in profile ? profile.data_collection : true}
                onCheckedChange={(checked) => onUpdate({ data_collection: checked })}
              />
            </div>
          </Suspense>
        </div>
      </Card>

      {/* Security Settings */}
      <Card className="bg-card border rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow duration-300">
        <h3 className="text-lg font-semibold mb-4 text-foreground">
          Безопасность
        </h3>
        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full justify-start hover:bg-accent transition-colors"
            onClick={() => setShowPasswordForm(!showPasswordForm)}
          >
            <Lock className="mr-2 h-4 w-4" />
            Изменить пароль
          </Button>

          {showPasswordForm && (
            <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-4 p-4 border border-border rounded-lg">
              <FormField
                label="Текущий пароль"
                error={passwordForm.formState.errors.current_password?.message}
              >
                <Input
                  {...passwordForm.register('current_password')}
                  type="password"
                  placeholder="Введите текущий пароль"
                />
              </FormField>

              <FormField
                label="Новый пароль"
                error={passwordForm.formState.errors.new_password?.message}
              >
                <Input
                  {...passwordForm.register('new_password')}
                  type="password"
                  placeholder="Введите новый пароль"
                />
              </FormField>

              <FormField
                label="Подтвердите пароль"
                error={passwordForm.formState.errors.confirm_password?.message}
              >
                <Input
                  {...passwordForm.register('confirm_password')}
                  type="password"
                  placeholder="Повторите новый пароль"
                />
              </FormField>

              <div className="flex gap-2">
                <Button type="submit" disabled={isSaving} className="transition-colors">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    'Сохранить'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="active:scale-95 active:opacity-80 transition-all"
                  onClick={() => {
                    setShowPasswordForm(false)
                    passwordForm.reset()
                  }}
                >
                  Отмена
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-destructive/5 border border-destructive/20 rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow duration-300">
        <h3 className="text-lg font-semibold mb-4 text-destructive flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Опасная зона
        </h3>
        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full justify-start border-green-500 text-green-600 hover:bg-green-50/50 transition-colors"
            onClick={onExportData}
          >
            <Download className="mr-2 h-4 w-4" />
            Экспортировать данные
          </Button>

          <Suspense fallback={<Button variant="outline" disabled className="w-full justify-start">Загрузка...</Button>}>
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start border-destructive text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 transition-colors"
                  aria-label="Открыть диалог удаления аккаунта"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Удалить аккаунт
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-destructive">Удалить аккаунт</DialogTitle>
                  <DialogDescription>
                    Это действие нельзя отменить. Все ваши данные будут удалены навсегда.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Введите <span className="font-mono font-bold">УДАЛИТЬ</span> для подтверждения:
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Введите УДАЛИТЬ"
                    aria-label="Подтверждение удаления"
                    aria-describedby="delete-confirm-description"
                    autoComplete="off"
                  />
                  <span id="delete-confirm-description" className="sr-only">
                    Для подтверждения введите слово УДАЛИТЬ заглавными буквами
                  </span>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    className="hover:bg-accent transition-colors"
                    onClick={() => {
                      setShowDeleteDialog(false)
                      setDeleteConfirmText('')
                    }}
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={deleteConfirmText !== 'УДАЛИТЬ'}
                    className="transition-colors"
                    onClick={async () => {
                      await onDeleteAccount()
                      setShowDeleteDialog(false)
                    }}
                  >
                    Удалить аккаунт
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Suspense>
        </div>
      </Card>
    </div>
  )
})

export default AccountSettingsSection