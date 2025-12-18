import { Badge } from '@/components/ui/badge'
import type { UserRole } from '@/types/database'
import { cn } from '@/lib/utils'

interface RoleBadgeProps {
  role: UserRole
  className?: string
  showIcon?: boolean
}

export function RoleBadge({ role, className, showIcon = true }: RoleBadgeProps) {
  const roleConfig = {
    superadmin: {
      label: 'SUPERADMIN',
      icon: '⚡',
      variant: 'destructive' as const,
      className: 'bg-gradient-to-r from-red-600 to-red-700 text-white font-bold border-red-600 shadow-lg shadow-red-500/50'
    },
    admin: {
      label: 'Admin',
      icon: '👑',
      variant: 'default' as const,
      className: 'bg-blue-600 text-white border-blue-600 font-semibold'
    },
    instructor: {
      label: 'Instructor',
      icon: '📚',
      variant: 'secondary' as const,
      className: 'bg-green-600 text-white border-green-600 font-medium'
    },
    student: {
      label: 'Student',
      icon: '🎓',
      variant: 'outline' as const,
      className: 'text-muted-foreground'
    }
  }

  const config = roleConfig[role] || roleConfig.student

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      {showIcon && config.icon && (
        <span className="mr-1" aria-hidden="true">{config.icon}</span>
      )}
      {config.label}
    </Badge>
  )
}

// Utility function to check if user is superadmin
export function isSuperAdmin(role?: UserRole): boolean {
  return role === 'superadmin'
}

// Utility function to check if user has admin privileges (superadmin or admin)
export function hasAdminPrivileges(role?: UserRole): boolean {
  return role === 'superadmin' || role === 'admin'
}

// Utility function to get role display name
export function getRoleDisplayName(role: UserRole): string {
  const names = {
    superadmin: 'Super Administrator',
    admin: 'Administrator',
    instructor: 'Instructor',
    student: 'Student'
  }
  return names[role] || 'Student'
}
