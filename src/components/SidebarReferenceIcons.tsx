import type { SVGProps } from 'react'

type SidebarReferenceIconProps = SVGProps<SVGSVGElement> & {
  title?: string
}

function IconFrame({ title, children, ...props }: SidebarReferenceIconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...props}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}

/** 1. Dashboard: Bento grid layout (Top-Left wide, Top-Right square, Bottom-Left square, Bottom-Right wide) */
export function ReferenceDashboardIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2.5" y="2.5" width="7" height="7" rx="2" fill="currentColor" />
      <rect x="10.5" y="2.5" width="7" height="7" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="2.5" y="10.5" width="7" height="7" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="10.5" y="10.5" width="7" height="7" rx="2" fill="currentColor" />
    </IconFrame>
  )
}

/** 2. Folder (Drafts Ready / Projects): Solid folder with crisp 100% white pill bar cutout */
export function ReferenceFolderIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M2.5 5C2.5 3.89543 3.39543 3 4.5 3H8.25C8.85 3 9.4 3.25 9.8 3.7L11.1 5.3H15.5C16.6046 5.3 17.5 6.19543 17.5 7.3V14.7C17.5 15.8046 16.6046 16.7 15.5 16.7H4.5C3.39543 16.7 2.5 15.8046 2.5 14.7V5Z"
        fill="currentColor"
      />
      <rect x="4.5" y="7.5" width="11" height="2.2" rx="1.1" fill="#FFFFFF" />
    </IconFrame>
  )
}

export function ReferenceBreadcrumbFolderIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M2.5 5C2.5 3.89543 3.39543 3 4.5 3H8.25C8.85 3 9.4 3.25 9.8 3.7L11.1 5.3H15.5C16.6046 5.3 17.5 6.19543 17.5 7.3V14.7C17.5 15.8046 16.6046 16.7 15.5 16.7H4.5C3.39543 16.7 2.5 15.8046 2.5 14.7V5Z"
        fill="currentColor"
      />
      <rect x="4.5" y="7.5" width="11" height="2.2" rx="1.1" fill="#FFFFFF" />
    </IconFrame>
  )
}

export function ReferenceBreadcrumbCurrentIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="4.5" fill="currentColor" />
      <circle cx="10" cy="10" r="2.75" fill="#FFFFFF" />
    </IconFrame>
  )
}

/** 3. Analytics: Easel Stand presentation board with crisp white trendline */
export function ReferenceAnalyticsIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2.5" y="2.5" width="15" height="10.5" rx="2" fill="currentColor" />
      <path d="M5 9.5L8 6.5L11 8.5L15 4.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 13L5 17.5M13.5 13L15 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </IconFrame>
  )
}

export function ReferenceReportIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 3C4 2.44772 4.44772 2 5 2H11.5L16 6.5V17C16 17.5523 15.5523 18 15 18H5C4.44772 18 4 17.5523 4 17V3Z" fill="currentColor" />
      <path d="M11 2V6.5H16" fill="#FFFFFF" opacity="0.4" />
      <rect x="6.5" y="9.5" width="7" height="1.8" rx="0.9" fill="#FFFFFF" />
      <rect x="6.5" y="13" width="4.5" height="1.8" rx="0.9" fill="#FFFFFF" />
    </IconFrame>
  )
}

/** 4. Keywords (Extensions / Puzzle piece) */
export function ReferencePuzzleIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M8.5 2.75H5C3.75736 2.75 2.75 3.75736 2.75 5V8.5C3.85457 8.5 4.75 9.39543 4.75 10.5C4.75 11.6046 3.85457 12.5 2.75 12.5V16C2.75 17.2426 3.75736 18.25 5 18.25H8.5C8.5 17.1454 9.39543 16.25 10.5 16.25C11.6046 16.25 12.5 17.1454 12.5 18.25H16C17.2426 18.25 18.25 17.2426 18.25 16V12.5C17.1454 12.5 16.25 11.6046 16.25 10.5C16.25 9.39543 17.1454 8.5 18.25 8.5V5C18.25 3.75736 17.2426 2.75 16 2.75H12.5C12.5 3.85457 11.6046 4.75 10.5 4.75C9.39543 4.75 8.5 3.85457 8.5 2.75Z"
        fill="currentColor"
      />
    </IconFrame>
  )
}

/** 5. Opportunities (Companies / 3D Isometric Cube with CAD Precision Seams) */
export function ReferenceCubeIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      {/* Top Face */}
      <path d="M10 2.2L16.8 5.8L10 9.4L3.2 5.8L10 2.2Z" fill="currentColor" opacity="0.45" />
      {/* Left Face */}
      <path d="M3.2 5.8L10 9.4V17.2L3.2 13.6V5.8Z" fill="currentColor" opacity="0.75" />
      {/* Right Face */}
      <path d="M10 9.4L16.8 5.8V13.6L10 17.2V9.4Z" fill="currentColor" />
      {/* Crisp Seam Lines */}
      <path d="M10 2.2L16.8 5.8L10 9.4L3.2 5.8Z" stroke="#FFFFFF" strokeWidth="0.7" opacity="0.7" />
      <path d="M10 9.4V17.2" stroke="#FFFFFF" strokeWidth="0.7" opacity="0.7" />
    </IconFrame>
  )
}

/** 6. People: Contact ID badge card with avatar circle & text bars */
export function ReferencePeopleIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2.5" y="3" width="15" height="14" rx="2.5" fill="currentColor" />
      {/* Profile Avatar */}
      <circle cx="7" cy="8.25" r="2.2" fill="#FFFFFF" />
      <path d="M4.5 14.5C5.1 12.8 6.2 12 7.5 12C8.8 12 9.9 12.8 10.5 14.5H4.5Z" fill="#FFFFFF" />
      {/* Text Lines */}
      <rect x="11.5" y="7" width="4" height="1.8" rx="0.9" fill="#FFFFFF" opacity="0.85" />
      <rect x="11.5" y="10" width="4" height="1.8" rx="0.9" fill="#FFFFFF" opacity="0.6" />
      <rect x="11.5" y="13" width="2.5" height="1.8" rx="0.9" fill="#FFFFFF" opacity="0.4" />
    </IconFrame>
  )
}

/** 7. Posted: Paper Plane Send Icon */
export function ReferencePostedIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M2.5 9.5L17.5 3L11.5 17.5L9 11.5L2.5 9.5Z" fill="currentColor" />
      <path d="M9 11.5L17.5 3" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </IconFrame>
  )
}

export function ReferenceCheckIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="10" cy="10" r="8" fill="currentColor" opacity="0.15" />
      <circle cx="10" cy="10" r="6.5" fill="currentColor" />
      <path d="M7 10L9 12L13 7.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </IconFrame>
  )
}
