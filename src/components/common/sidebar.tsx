import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const navItems = [
  { name: '首页', path: '/board' },
  { name: '发射', path: '/launch' },
  { name: '控制台', path: '/dashboard' },
  // { name: '我的', path: '/me' },
]

const languages = ['中文', 'EN']

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const [isLangOpen, setIsLangOpen] = useState(false)
  const [currentLang, setCurrentLang] = useState('中文')

  // 打开侧边栏时锁定背景页面滚动
  useEffect(() => {
    if (!isOpen) return

    const scrollY = window.scrollY
    const { body } = document
    const originalOverflow = body.style.overflow
    const originalPosition = body.style.position

    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.insetBlockStart = `-${scrollY}px`
    body.style.inlineSize = '100%'

    return () => {
      body.style.overflow = originalOverflow
      body.style.position = originalPosition
      body.style.insetBlockStart = ''
      body.style.inlineSize = ''
      window.scrollTo(0, scrollY)
    }
  }, [isOpen])

  if (typeof document === 'undefined') return null

  return createPortal(
    <aside
      aria-label="侧边菜单"
      className={`fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-y-auto bg-[#070808] transition-transform duration-300 ease-in-out ${
        isOpen
          ? 'translate-x-0 pointer-events-auto'
          : '-translate-x-full pointer-events-none'
      }`}
    >
      <nav className="flex flex-col">
        {navItems.map((item) => (
          <Link
            key={item.name}
            to={item.path}
            onClick={onClose}
            className="flex items-center justify-between border-b border-b-[#303236] px-6 py-6 text-white transition-colors hover:bg-white/5 active:bg-white/10"
          >
            <span className="text-base">{item.name}</span>
            <ArrowUpRight className="size-5 text-white" />
          </Link>
        ))}

        {/* 语言选项行 */}
        <div className="relative border-b border-b-[#303236]">
          <button
            type="button"
            onClick={() => setIsLangOpen((prev) => !prev)}
            className="flex w-full cursor-pointer items-center justify-between p-6 text-white transition-colors hover:bg-white/5 active:bg-white/10"
          >
            <span className="text-base">语言</span>
            <div className="flex items-center space-x-1.5 text-base text-[#A0A3A7]">
              <span>{currentLang}</span>
              <ChevronRight
                className={`size-5 text-white transition-transform duration-200 ${
                  isLangOpen ? 'rotate-90' : 'rotate-0'
                }`}
              />
            </div>
          </button>

          {/* 独立悬浮浮层下拉菜单 */}
          <AnimatePresence>
            {isLangOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-6 top-full z-50 mt-1 w-32 rounded-lg border border-[#303236] bg-[#141517] p-1.5 shadow-2xl"
              >
                {languages.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      setCurrentLang(lang)
                      setIsLangOpen(false)
                    }}
                    className={`flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                      currentLang === lang
                        ? 'bg-white/10 font-semibold text-white'
                        : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span>{lang}</span>
                    {currentLang === lang && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#FE810B]" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>
    </aside>,
    document.body,
  )
}
