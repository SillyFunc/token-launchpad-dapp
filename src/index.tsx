import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { router } from '@/router'
import { Web3Provider } from '@/providers/web3-provider'
import { LocaleProvider } from '@/lib/i18n'
import './index.css'

document.documentElement.classList.add('dark')

const rootEl = document.getElementById('root')
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl)
  root.render(
    <React.StrictMode>
      <LocaleProvider>
        <Web3Provider>
          <RouterProvider router={router} />
        </Web3Provider>
      </LocaleProvider>
    </React.StrictMode>,
  )
}
