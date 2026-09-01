import { useState } from 'react'
import { Outlet } from 'react-router'
import { Sidebar } from '../components/common/sidebar'
import { Header } from '../components/common/header'
import { Toaster } from '@/components/ui/toast'

export const MainLayout = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="relative size-full bg-black flex min-h-dvh flex-col text-white">
      <Header
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen((prev) => !prev)}
      />
      <Sidebar isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      <main className="relative z-10 mx-auto flex min-h-0 w-full flex-1 flex-col px-4">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}
