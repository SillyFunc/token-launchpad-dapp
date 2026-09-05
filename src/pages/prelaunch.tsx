import { PageBackTitle } from '@/components/common/page-back-title'
import { SectionWrapper } from '@/components/prelaunch/section-wrapper'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNavigate } from 'react-router'

export const Prelaunch = () => {
  const nav = useNavigate()
  const handleBack = () => {
    nav('/launch')
  }
  return (
    <div className="flex-1 flex flex-col">
      <PageBackTitle title="保留您的代币 CA" onBack={handleBack} />
      <Card className="bg-[#131516] border border-[#484b51] px-4 py-4! space-y-6!">
        <SectionWrapper title="生成 CA" prefix={1}>
          <p className="text-sm text-[#a0a3a7]">
            我们将为您生成代币 CA, 只需几秒钟。
          </p>
          <Button className="max-w-50 text-sm font-semibold h-10 [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B]">
            生成 CA
          </Button>
        </SectionWrapper>
        <SectionWrapper title="锁定 CA 地址" prefix={2}>
          <div className="flex flex-col gap-2">
            <Label>保留 CA</Label>
            <Input
              disabled
              className="border border-[#84888c] h-10.5 bg-[#18191b]! text-white text-sm"
            />
          </div>
          <Button className="max-w-50 text-sm font-semibold px-4 h-10 [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B]">
            锁定地址 (0.01BNB)
          </Button>
        </SectionWrapper>
        <SectionWrapper title="发布您的代币" prefix={3}>
          <div className="border border-[#484b51] p-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-y-2">
                <span className="text-sm text-white">可用的保留 CA</span>
                <span className="text-[#84888c] text-xs">
                  展示连接钱包下的预留地址。
                </span>
              </div>
              <Button className="text-xs text-white border border-[#84888c] bg-transparent h-8 px-6 [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] shrink-0">
                重新整理
              </Button>
            </div>
          </div>
        </SectionWrapper>
      </Card>
    </div>
  )
}
