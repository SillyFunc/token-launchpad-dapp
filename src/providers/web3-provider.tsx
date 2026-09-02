import { WagmiProvider, createConfig, http, webSocket, injected, fallback } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { walletConnect } from 'wagmi/connectors'

import { CHAINS_CONFIG, SUPPORTED_CHAINS } from '@/config/network'

const config = createConfig({
  chains: SUPPORTED_CHAINS,
  connectors: [
    injected(),
    walletConnect({
      projectId: '316843c7685d03b697a4073244b56a94',
      showQrModal: false,
    }),
  ],
  transports: {
    [97]: fallback([
      ...(CHAINS_CONFIG[97].rpcUrls.webSocket || []).map((url) => webSocket(url)),
      ...CHAINS_CONFIG[97].rpcUrls.http.map((url) => http(url)),
    ]),
    [56]: fallback([
      ...(CHAINS_CONFIG[56].rpcUrls.webSocket || []).map((url) => webSocket(url)),
      ...CHAINS_CONFIG[56].rpcUrls.http.map((url) => http(url)),
    ]),
  },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  },
})

export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          debugMode={false}
          theme="midnight"
          options={{
            language: 'zh-CN',
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
