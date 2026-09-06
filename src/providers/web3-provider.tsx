import { WagmiProvider, createConfig, http, webSocket, injected, fallback } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { walletConnect } from 'wagmi/connectors'
import { mainnet } from 'viem/chains'

import { CHAINS_CONFIG, SUPPORTED_CHAINS, ETHEREUM_MAINNET_RPC } from '@/config/network'

/**
 * 单链 transport 构建策略：HTTP 节点在前（读数是请求-响应，低延迟、无需握手，
 * 按 network.ts 列表顺序依次故障切换），WS 殿后——HTTP transport 不支持事件订阅，
 * fallback 遇到订阅类请求（watchContractEvent 等）会自动路由到列表里的 WS。
 */
function chainTransports(chainId: keyof typeof CHAINS_CONFIG) {
  const { http: httpUrls, webSocket: wsUrls } = CHAINS_CONFIG[chainId].rpcUrls
  return fallback([
    ...httpUrls.map((url) => http(url)),
    ...(wsUrls ?? []).map((url) => webSocket(url)),
  ])
}

const config = createConfig({
  chains: SUPPORTED_CHAINS,
  connectors: [
    injected(),
    walletConnect({
      projectId: '316843c7685d03b697a4073244b56a94',
      showQrModal: false,
    }),
  ],
  // transports 的 key 是 chainId，wagmi 发起对应链的请求时按此取用
  transports: {
    [97]: chainTransports(97),
    [56]: chainTransports(56),
    // 以太坊主网仅作钱包网络支持（平台合约未部署），无事件订阅需求，单 HTTP 即可
    [mainnet.id]: http(ETHEREUM_MAINNET_RPC),
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
