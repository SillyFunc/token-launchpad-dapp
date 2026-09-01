import SectionIcon from '@/assets/icons/section-title-icon.svg'

interface FormSectionTitleProps {
  title: string
  required?: boolean
}
export const FormSectionTitle = ({
  title,
  required = false,
}: FormSectionTitleProps) => {
  return (
    <div className="flex items-center gap-2 relative">
      <img
        src={SectionIcon}
        alt=""
        aria-hidden="true"
        className="size-4 absolute -left-6 align-middle"
      />
      <div className="text-base font-normal leading-normal text-white pl-1.5">
        {title}
        {required && <span className="ml-0.5 text-[#f7594b]">&#42;</span>}
      </div>
    </div>
  )
}
