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
import { Lock, Download, Trash2, Moon, Sun, Loader2, AlertTriangle, Send } from 'lucide-react'
import { passwordSchema, type PasswordFormData } from '../validation-schemas'
import type { UserProfile } from '../page'
import type { UserPreferences } from '@/lib/user-preferences'

// Lazy load heavy components
const Select = dynamic(
  () =>
    import('@/components/ui/select').then((mod) => ({
      default: mod.Select,
    })),
  { ssr: false }
)
const SelectContent = dynamic(() =>
  import('@/components/ui/select').then((mod) => ({
    default: mod.SelectContent,
  }))
)
const SelectItem = dynamic(() =>
  import('@/components/ui/select').then((mod) => ({
    default: mod.SelectItem,
  }))
)
const SelectTrigger = dynamic(() =>
  import('@/components/ui/select').then((mod) => ({
    default: mod.SelectTrigger,
  }))
)
const SelectValue = dynamic(() =>
  import('@/components/ui/select').then((mod) => ({
    default: mod.SelectValue,
  }))
)

const Switch = dynamic(
  () =>
    import('@/components/ui/switch').then((mod) => ({
      default: mod.Switch,
    })),
  { ssr: false }
)

const Dialog = dynamic(() =>
  import('@/components/ui/dialog').then((mod) => ({
    default: mod.Dialog,
  }))
)
const DialogContent = dynamic(() =>
  import('@/components/ui/dialog').then((mod) => ({
    default: mod.DialogContent,
  }))
)
const DialogDescription = dynamic(() =>
  import('@/components/ui/dialog').then((mod) => ({
    default: mod.DialogDescription,
  }))
)
const DialogFooter = dynamic(() =>
  import('@/components/ui/dialog').then((mod) => ({
    default: mod.DialogFooter,
  }))
)
const DialogHeader = dynamic(() =>
  import('@/components/ui/dialog').then((mod) => ({
    default: mod.DialogHeader,
  }))
)
const DialogTitle = dynamic(() =>
  import('@/components/ui/dialog').then((mod) => ({
    default: mod.DialogTitle,
  }))
)
const DialogTrigger = dynamic(() =>
  import('@/components/ui/dialog').then((mod) => ({
    default: mod.DialogTrigger,
  }))
)

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
  onDeleteAccount,
}: AccountSettingsSectionProps) {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const { theme, setTheme } = useThemeSync()
  const [telegramChatId, setTelegramChatId] = useState(profile.telegram_chat_id || '')
  const [telegramNotifications, setTelegramNotifications] = useState(
    profile.telegram_notifications_enabled || false
  )
  const [isTelegramSaving, setIsTelegramSaving] = useState(false)

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  })

  const handlePasswordSubmit = () => {
    // In production, this would call the backend API
    toast.success('Пароль успешно изменен')
    setShowPasswordForm(false)
    passwordForm.reset()
  }

  const handleTelegramSave = async () => {
    // Validate chat_id format (only digits, optional minus for groups)
    if (telegramChatId && !/^-?\d+$/.test(telegramChatId)) {
      toast.error('Chat ID должен содержать только цифры')
      return
    }

    setIsTelegramSaving(true)
    try {
      await onUpdate({
        telegram_chat_id: telegramChatId || null,
        telegram_notifications_enabled: telegramNotifications,
      })
      toast.success('Telegram настройки сохранены')
    } catch {
      toast.error('Не удалось сохранить Telegram настройки')
    } finally {
      setIsTelegramSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Theme & Language Settings */}
      <Card className="bg-card rounded-xl border p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg">
        <h3 className="text-foreground mb-4 text-lg font-semibold">Настройки интерфейса</h3>
        <div className="space-y-4">
          <div>
            <Label>Тема оформления</Label>
            <div className="mt-2 flex gap-4">
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    setTheme('light')
                    // Also update in the database
                    await onUpdate({ theme_preference: 'light' })
                  })()
                }}
                className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 transition-all ${
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
                onClick={() => {
                  void (async () => {
                    setTheme('dark')
                    // Also update in the database
                    await onUpdate({ theme_preference: 'dark' })
                  })()
                }}
                className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 transition-all ${
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
            <Suspense
              fallback={<div className="bg-muted mt-2 h-10 w-full animate-pulse rounded-md" />}
            >
              <Select
                value={'language' in profile ? profile.language : 'ru'}
                onValueChange={(value) => {
                  void onUpdate({ language: value })
                }}
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
      <Card className="bg-card rounded-xl border p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg">
        <h3 className="text-foreground mb-4 text-lg font-semibold">Уведомления</h3>
        <div className="divide-border space-y-0 divide-y">
          <Suspense
            fallback={
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted h-12 animate-pulse rounded" />
                ))}
              </div>
            }
          >
            <div className="flex items-center justify-between py-4 first:pt-0">
              <div className="space-y-0.5">
                <Label htmlFor="email-notifications">Email уведомления</Label>
                <p className="text-muted-foreground text-sm" id="email-notifications-description">
                  Получать уведомления на email
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={'email_notifications' in profile ? profile.email_notifications : true}
                onCheckedChange={(checked) => {
                  void onUpdate({ email_notifications: checked })
                }}
                aria-label="Получать уведомления на email"
                aria-describedby="email-notifications-description"
              />
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label htmlFor="course-updates">Обновления курсов</Label>
                <p className="text-muted-foreground text-sm">Обновления ваших курсов</p>
              </div>
              <Switch
                id="course-updates"
                checked={'email_course_updates' in profile ? profile.email_course_updates : true}
                onCheckedChange={(checked) => {
                  void onUpdate({ email_course_updates: checked })
                }}
              />
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label htmlFor="push-notifications">Push уведомления</Label>
                <p className="text-muted-foreground text-sm">Уведомления в браузере</p>
              </div>
              <Switch
                id="push-notifications"
                checked={'push_notifications' in profile ? profile.push_notifications : false}
                onCheckedChange={(checked) => {
                  void onUpdate({ push_notifications: checked })
                }}
              />
            </div>
          </Suspense>
        </div>
      </Card>

      {/* Telegram Notifications */}
      <Card className="bg-card rounded-xl border p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg">
        <h3 className="text-foreground mb-4 flex items-center gap-2 text-lg font-semibold">
          <Send className="h-5 w-5" />
          Telegram уведомления
        </h3>
        <p className="text-muted-foreground mb-4 text-sm">
          Получайте уведомления о статусе генерации курсов в Telegram
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="telegram-chat-id">Telegram Chat ID</Label>
            <Input
              id="telegram-chat-id"
              type="text"
              placeholder="Введите ваш Chat ID"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              className="mt-2"
              aria-describedby="telegram-chat-id-help"
            />
            <p id="telegram-chat-id-help" className="text-muted-foreground mt-2 text-xs">
              Напишите боту <span className="font-mono">@userinfobot</span> в Telegram, чтобы узнать
              свой Chat ID
            </p>
          </div>

          <Suspense fallback={<div className="bg-muted h-10 animate-pulse rounded" />}>
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="telegram-notifications">Включить Telegram уведомления</Label>
                <p className="text-muted-foreground text-sm">Получать уведомления о курсах</p>
              </div>
              <Switch
                id="telegram-notifications"
                checked={telegramNotifications}
                onCheckedChange={setTelegramNotifications}
                disabled={!telegramChatId}
                aria-label="Включить Telegram уведомления"
              />
            </div>
          </Suspense>

          {(telegramChatId !== (profile.telegram_chat_id || '') ||
            telegramNotifications !== (profile.telegram_notifications_enabled || false)) && (
            <Button
              onClick={() => {
                void handleTelegramSave()
              }}
              disabled={isTelegramSaving}
              className="w-full transition-colors"
            >
              {isTelegramSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                'Сохранить'
              )}
            </Button>
          )}
        </div>
      </Card>

      {/* Privacy Settings */}
      <Card className="bg-card rounded-xl border p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg">
        <h3 className="text-foreground mb-4 text-lg font-semibold">Конфиденциальность</h3>
        <div className="divide-border space-y-0 divide-y">
          <Suspense
            fallback={
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted h-12 animate-pulse rounded" />
                ))}
              </div>
            }
          >
            <div className="flex items-center justify-between py-4 first:pt-0">
              <div className="space-y-0.5">
                <Label htmlFor="profile-visibility">Публичный профиль</Label>
                <p className="text-muted-foreground text-sm">Разрешить другим видеть ваш профиль</p>
              </div>
              <Switch
                id="profile-visibility"
                checked={
                  'profile_visibility' in profile ? profile.profile_visibility === 'public' : true
                }
                onCheckedChange={(checked) => {
                  void onUpdate({ profile_visibility: checked ? 'public' : 'private' })
                }}
              />
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label htmlFor="show-achievements">Показывать достижения</Label>
                <p className="text-muted-foreground text-sm">
                  Отображать ваши достижения в профиле
                </p>
              </div>
              <Switch
                id="show-achievements"
                checked={'show_achievements' in profile ? profile.show_achievements : true}
                onCheckedChange={(checked) => {
                  void onUpdate({ show_achievements: checked })
                }}
              />
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="space-y-0.5">
                <Label htmlFor="data-collection">Сбор данных</Label>
                <p className="text-muted-foreground text-sm">Помогать улучшать сервис</p>
              </div>
              <Switch
                id="data-collection"
                checked={'data_collection' in profile ? profile.data_collection : true}
                onCheckedChange={(checked) => {
                  void onUpdate({ data_collection: checked })
                }}
              />
            </div>
          </Suspense>
        </div>
      </Card>

      {/* Security Settings */}
      <Card className="bg-card rounded-xl border p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg">
        <h3 className="text-foreground mb-4 text-lg font-semibold">Безопасность</h3>
        <div className="space-y-4">
          <Button
            variant="outline"
            className="hover:bg-accent w-full justify-start transition-colors"
            onClick={() => setShowPasswordForm(!showPasswordForm)}
          >
            <Lock className="mr-2 h-4 w-4" />
            Изменить пароль
          </Button>

          {showPasswordForm && (
            <form
              onSubmit={(e) => void passwordForm.handleSubmit(handlePasswordSubmit)(e)}
              className="border-border space-y-4 rounded-lg border p-4"
            >
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
                  className="transition-all active:scale-95 active:opacity-80"
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
      <Card className="bg-destructive/5 border-destructive/20 rounded-xl border p-6 shadow-sm transition-shadow duration-300 hover:shadow-lg">
        <h3 className="text-destructive mb-4 flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="h-5 w-5" />
          Опасная зона
        </h3>
        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full justify-start border-green-500 text-green-600 transition-colors hover:bg-green-50/50"
            onClick={onExportData}
          >
            <Download className="mr-2 h-4 w-4" />
            Экспортировать данные
          </Button>

          <Suspense
            fallback={
              <Button variant="outline" disabled className="w-full justify-start">
                Загрузка...
              </Button>
            }
          >
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive/10 focus-visible:ring-destructive w-full justify-start transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
                  <p className="text-muted-foreground text-sm">
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
                    onClick={() => {
                      void (async () => {
                        await onDeleteAccount()
                        setShowDeleteDialog(false)
                      })()
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
