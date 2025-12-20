'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Moon, Sun, LogOut, Settings } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useThemeSync } from '@/lib/hooks/use-theme-sync';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AdminUserMenuProps {
  userEmail: string;
}

export function AdminUserMenu({ userEmail }: AdminUserMenuProps) {
  const router = useRouter();
  const { theme, setTheme, mounted } = useThemeSync();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full border border-gray-300 bg-gray-100 hover:bg-gray-200 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:bg-zinc-700/50"
        >
          <User className="h-4 w-4 text-gray-700 dark:text-zinc-300" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-white border-gray-200 dark:bg-zinc-900 dark:border-zinc-700">
        <DropdownMenuLabel className="text-gray-900 dark:text-zinc-300">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">Admin Account</p>
            <p className="text-xs text-gray-500 dark:text-zinc-500 truncate">{userEmail}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-200 dark:bg-zinc-700" />

        {/* Theme Toggle */}
        <DropdownMenuItem
          className="cursor-pointer text-gray-700 hover:bg-gray-100 focus:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {mounted && theme === 'dark' ? (
            <>
              <Sun className="mr-2 h-4 w-4" />
              Светлая тема
            </>
          ) : (
            <>
              <Moon className="mr-2 h-4 w-4" />
              Тёмная тема
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-gray-200 dark:bg-zinc-700" />

        {/* Profile Link */}
        <DropdownMenuItem asChild className="cursor-pointer text-gray-700 hover:bg-gray-100 focus:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800">
          <Link href="/profile">
            <Settings className="mr-2 h-4 w-4" />
            Профиль
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-gray-200 dark:bg-zinc-700" />

        {/* Sign Out */}
        <DropdownMenuItem
          className="cursor-pointer text-red-600 hover:bg-gray-100 focus:bg-gray-100 hover:text-red-700 dark:text-red-400 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800 dark:hover:text-red-300"
          onClick={handleSignOut}
          disabled={isLoggingOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {isLoggingOut ? 'Выход...' : 'Выйти'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
