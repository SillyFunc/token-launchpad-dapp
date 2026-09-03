import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'

import titleBackArrow from '@/assets/icons/back-arrow.svg'
import { getTokenDetailById } from '@/api/token'
import { useTokenGate } from '@/hooks/use-token-gate'
import { BlockedState } from '@/components/presale/blocked-state'
import { LaunchForm } from '@/components/launch/launch-form'

export const Launch = () => {
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id') || searchParams.get('edit')
  const isEditMode = Boolean(editId)

  // 编辑模式：拉取草稿详情
  const {
    data: tokenDetail,
    isLoading: isDetailLoading,
    isError: isDetailError,
  } = useQuery({
    queryKey: ['tokenDetailById', editId],
    queryFn: () => getTokenDetailById(editId!),
    enabled: isEditMode,
  })

  // 代币门禁守卫（校验已发行状态与创建者权限）
  const { canEdit, isChainLoading } = useTokenGate({
    token: tokenDetail,
    tokenAddress: tokenDetail?.coinContractAddress,
  })

  // 编辑模式下的门禁与加载拦截
  if (isEditMode) {
    if (isDetailLoading || isChainLoading) {
      return (
        <div className="relative mx-auto flex w-full flex-col pb-28 pt-6">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              aria-label="返回"
              onClick={() => window.history.back()}
              className="flex size-6 shrink-0 items-center justify-center rounded-xs hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
            >
              <img
                src={titleBackArrow}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
              />
            </button>
            <span className="text-lg font-semibold text-white tracking-wide">
              编辑代币信息
            </span>
          </div>
          <div className="rounded border border-[#484b51] bg-[#131516] p-8">
            <BlockedState
              title="正在加载代币数据…"
              reason=""
              isLoading={true}
            />
          </div>
        </div>
      )
    }

    if (isDetailError || !tokenDetail) {
      return (
        <div className="relative mx-auto flex w-full flex-col pb-28 pt-6">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              aria-label="返回"
              onClick={() => window.history.back()}
              className="flex size-6 shrink-0 items-center justify-center rounded-xs hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
            >
              <img
                src={titleBackArrow}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
              />
            </button>
            <span className="text-lg font-semibold text-white tracking-wide">
              编辑代币信息
            </span>
          </div>
          <div className="rounded border border-[#484b51] bg-[#131516] p-8">
            <BlockedState
              title="代币信息不存在"
              reason="未能检索到该代币的草稿信息，请返回控制台。"
              primaryAction={{ label: '前往控制台', to: '/dashboard' }}
            />
          </div>
        </div>
      )
    }

    // 关键门禁：已发行代币不允许编辑信息（合约参数已被固化）
    if (!canEdit.allowed) {
      return (
        <div className="relative mx-auto flex w-full flex-col pb-28 pt-6">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              aria-label="返回"
              onClick={() => window.history.back()}
              className="flex size-6 shrink-0 items-center justify-center rounded-xs hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
            >
              <img
                src={titleBackArrow}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
              />
            </button>
            <span className="text-lg font-semibold text-white tracking-wide">
              编辑代币信息
            </span>
          </div>
          <div className="rounded border border-[#484b51] bg-[#131516] p-8">
            <BlockedState
              title="不可编辑代币信息"
              reason={
                canEdit.reason ??
                '该代币已在链上部署发行，合约参数已被固化，无法再编辑资料。'
              }
              primaryAction={{ label: '前往控制台', to: '/dashboard' }}
            />
          </div>
        </div>
      )
    }
  }

  return <LaunchForm initialData={tokenDetail} editId={editId} />
}
