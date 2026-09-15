import { useConnection } from 'wagmi'
import { Header } from '../common/header'
import { Sidebar } from '../common/sidebar'
import { useState } from 'react'
import { initialize } from '@/api/auth'
import { useQuery } from '@tanstack/react-query'

export const TokenLayout = ({ children }: { children: React.ReactNode }) => {
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
      <main className="min-h-0 flex-1 overflow-hidden flex flex-col bg-[#070808] pb-4">
        {children}
      </main>
    </div>
  )
}
