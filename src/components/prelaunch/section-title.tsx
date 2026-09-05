export const SectionTitle = ({
  title,
  prefix,
}: {
  title: string
  prefix: number
}) => {
  return (
    <div className="flex items-center gap-x-3">
      <div className="flex items-center justify-center font-semibold text-xs text-white size-5 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] [clip-path:polygon(0_0,100%_0,100%_81.25%,81.25%_100%,0_100%)]">
        {prefix}
      </div>
      <span className="text-base text-white">{title}</span>
    </div>
  )
}
