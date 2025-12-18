'use client'

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { LogOut, Settings, BookOpen } from 'lucide-react'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface AuthUser {
  id: string
  email?: string
  name?: string
  image?: string
  role?: string
}

interface AuthStatusProps {
  user?: AuthUser
}

export function AuthStatus({ user }: AuthStatusProps) {
  const { open } = useAuthModal()
  const router = useRouter()
  
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }
  
  if (!user) {
    return (
      <div className="flex gap-2">
        <Button 
          variant="ghost" 
          onClick={() => open('login')}
          className="text-gray-300 hover:text-white hover:bg-slate-800"
        >
          Войти
        </Button>
        <Button 
          variant="default"
          onClick={() => open('register')}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          Регистрация
        </Button>
      </div>
    )
  }
  
  const initials = user.name?.[0] || user.email?.[0] || 'U'
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-2 text-gray-300 hover:text-white hover:bg-slate-800">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image || undefined} />
            <AvatarFallback className="bg-purple-600/20 text-purple-400">
              {initials.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline max-w-[150px] truncate">
            {user.name || user.email}
          </span>
          {user.role === 'superadmin' && (
            <Badge className="ml-2 bg-purple-600/20 text-purple-400 border-purple-600/30">
              Admin
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-slate-900 border-slate-700">
        <div className="flex items-center justify-start gap-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            <p className="font-medium text-white">{user.name || 'Пользователь'}</p>
            <p className="w-[200px] truncate text-sm text-gray-400">
              {user.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        {/* Profile page - not implemented yet, hidden from menu */}
        <DropdownMenuItem asChild>
          <Link href="/courses" className="cursor-pointer text-gray-300 hover:text-white hover:bg-slate-800">
            <BookOpen className="mr-2 h-4 w-4" />
            Все курсы
          </Link>
        </DropdownMenuItem>
        {user.role === 'superadmin' && (
          <DropdownMenuItem asChild>
            <Link href="/courses" className="cursor-pointer text-gray-300 hover:text-white hover:bg-slate-800">
              <Settings className="mr-2 h-4 w-4" />
              Управление курсами
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={handleSignOut}
          className="cursor-pointer text-red-600 focus:text-red-600"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}