export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap ${className}`.trim()}>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        width="1.25em"
        height="1.25em"
        className="shrink-0"
      >
        <rect x="2" y="12" width="6" height="10" rx="1.5" fill="#1A73E8" />
        <rect x="9" y="4" width="6" height="18" rx="1.5" fill="#FBBC04" />
        <rect x="16" y="8" width="6" height="14" rx="1.5" fill="#34A853" />
      </svg>
      <span>
        <span className="font-bold text-[#202124]">BAU Tripoli</span>
        <span className="font-normal text-[#5F6368]"> · Open House</span>
      </span>
    </span>
  );
}
