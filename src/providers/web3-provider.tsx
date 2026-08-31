import { WagmiProvider, createConfig, http, injected, fallback } from 'wagmi'
import { bsc, bscTestnet } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { walletConnect } from 'wagmi/connectors'

const config = createConfig({
  chains: [bscTestnet, bsc],
  connectors: [
    injected(),
    walletConnect({
      projectId: '316843c7685d03b697a4073244b56a94',
      showQrModal: false,
    }),
  ],
  transports: {
    [bscTestnet.id]: fallback([
      http('https://bsc-testnet-rpc.publicnode.com'),
      http('https://bsc-testnet.blockpi.network/v1/rpc/public'),
      http('https://data-seed-prebsc-1-s1.binance.org:8545/'),
    ]),
    [bsc.id]: fallback([
      http('https://binance.llamarpc.com'),
      http('https://bsc-dataseed.binance.org/'),
      http('https://1rpc.io/bnb'),
    ]),
  },
})

const queryClient = new QueryClient()

export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          debugMode
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
