'use client'

import React from 'react'
import ProfileMenu from './profile-menu'

// Demo component to showcase the ProfileMenu functionality
export default function ProfileMenuDemo() {
  const mockUsers = [
    {
      id: '1',
      email: 'student@example.com',
      name: 'Студент',
      image: undefined,
      role: 'student' as const
    },
    {
      id: '2',
      email: 'admin@example.com',
      name: 'Администратор',
      image: undefined,
      role: 'admin' as const
    },
    {
      id: '3',
      email: 'superadmin@example.com',
      name: 'Супер Администратор',
      image: undefined,
      role: 'superadmin' as const
    }
  ]

  const handleSignOut = async () => {
    // Mock sign out triggered - demo only
    return Promise.resolve()
  }

  const customActions = [
    {
      id: 'notifications',
      label: 'Уведомления',
      icon: () => (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5V4a2 2 0 00-2-2H8a2 2 0 00-2 2v8l-5 5h5m12 0a3 3 0 11-6 0m6 0H9" />
        </svg>
      ),
      onClick: () => { /* Notifications clicked - demo only */ }
    }
  ]

  return (
    <div className="p-8 bg-background">
      <h2 className="text-2xl font-bold mb-6">ProfileMenu Component Demo</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {mockUsers.map((user, index) => (
          <div key={user.id} className="p-4 border rounded-lg">
            <h3 className="text-lg font-semibold mb-4">{user.role} роль</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{user.email}</span>
              <ProfileMenu
                user={user}
                onSignOut={handleSignOut}
                showRoleBadge={true}
                customActions={index === 0 ? customActions : []}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 border rounded-lg bg-slate-900">
        <h3 className="text-lg font-semibold mb-4 text-white">Dark Mode Test</h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">darkMode + forceWhiteDropdown</span>
          <ProfileMenu
            user={mockUsers[1]}
            onSignOut={handleSignOut}
            darkMode={true}
            forceWhiteDropdown={true}
            showRoleBadge={true}
          />
        </div>
      </div>
      
      <div className="mt-6 p-4 border rounded-lg bg-accent/5">
        <h4 className="font-semibold mb-2">Features Demonstrated:</h4>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>✅ Role badges (user/admin/super_admin)</li>
          <li>✅ Avatar with initials fallback</li>
          <li>✅ Theme toggle integration</li>
          <li>✅ Custom actions support</li>
          <li>✅ Dark mode styling</li>
          <li>✅ Accessibility features</li>
          <li>✅ Responsive design</li>
          <li>✅ Enhanced profile header</li>
          <li>✅ Navigation menu items</li>
          <li>✅ Error boundary protection</li>
        </ul>
      </div>
    </div>
  )
}