import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { router } from '@/router'
import { Web3Provider } from '@/providers/web3-provider'
import './index.css'

const rootEl = document.getElementById('root')
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl)
  root.render(
    <React.StrictMode>
      <Web3Provider>
        <RouterProvider router={router} />
      </Web3Provider>
    </React.StrictMode>,
  )
}
