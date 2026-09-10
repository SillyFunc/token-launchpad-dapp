import { useState } from 'react'
import { Outlet } from 'react-router'
import { Sidebar } from '../components/common/sidebar'
import { Header } from '../components/common/header'
import { Toaster } from '@/components/ui/toast'
import { useConnection } from 'wagmi'
import { initialize } from '@/api/auth'
import { useQuery } from '@tanstack/react-query'

export const MainLayout = () => {
  const { address } = useConnection()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useQuery({
    queryKey: ['initialize'],
    queryFn: () => initialize(address!),
    enabled: Boolean(address),
    staleTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

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
