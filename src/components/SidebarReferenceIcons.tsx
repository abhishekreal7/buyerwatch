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

/** 1. Dashboard: Bento grid matching Dashboard.png (3 rounded squares + top-right circle) */
export function ReferenceDashboardIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2.5" y="2.5" width="6.8" height="6.8" rx="2" fill="currentColor" />
      <circle cx="14.1" cy="5.9" r="3.4" fill="currentColor" />
      <rect x="2.5" y="10.7" width="6.8" height="6.8" rx="2" fill="currentColor" />
      <rect x="10.7" y="10.7" width="6.8" height="6.8" rx="2" fill="currentColor" />
    </IconFrame>
  )
}

/** 2. Drafts Ready: Solid folder matching Projects.png */
export function ReferenceFolderIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M2.5 5.5C2.5 4.39543 3.39543 3.5 4.5 3.5H8.25C8.85 3.5 9.4 3.75 9.8 4.2L11.1 5.8H15.5C16.6046 5.8 17.5 6.69543 17.5 7.8V14.5C17.5 15.6046 16.6046 16.5 15.5 16.5H4.5C3.39543 16.5 2.5 15.6046 2.5 14.5V5.5Z"
        fill="currentColor"
      />
    </IconFrame>
  )
}

export function ReferenceBreadcrumbFolderIcon(props: SidebarReferenceIconProps) {
  return <ReferenceFolderIcon {...props} />
}

export function ReferenceBreadcrumbCurrentIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="4.5" fill="currentColor" />
      <circle cx="10" cy="10" r="2.75" fill="#FFFFFF" />
    </IconFrame>
  )
}

/** 3. Analytics: Presentation easel board with trendline matching Analytics.png */
export function ReferenceAnalyticsIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2.5" y="2.5" width="15" height="9.5" rx="1.8" fill="currentColor" />
      <path d="M5.5 8.5L8.5 5.5L11.5 7.5L14.5 4.5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5.5" cy="8.5" r="1.1" fill="#FFFFFF" />
      <circle cx="8.5" cy="5.5" r="1.1" fill="#FFFFFF" />
      <circle cx="11.5" cy="7.5" r="1.1" fill="#FFFFFF" />
      <circle cx="14.5" cy="4.5" r="1.1" fill="#FFFFFF" />
      <path d="M6.5 12.2L4.5 17.2M13.5 12.2L15.5 17.2M10 12.2V16.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </IconFrame>
  )
}

export function ReferenceReportIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 3C4 2.44772 4.44772 2 5 2H11.5L16 6.5V17C16 17.5523 15.5523 18 15 18H5C4.44772 18 4 17.5523 4 17V3Z" fill="currentColor" />
      <path d="M11 2V6.5H16" fill="#FFFFFF" />
      <rect x="6.5" y="9.5" width="7" height="1.8" rx="0.9" fill="#FFFFFF" />
      <rect x="6.5" y="13" width="4.5" height="1.8" rx="0.9" fill="#FFFFFF" />
    </IconFrame>
  )
}

/** 4. Keywords: Puzzle piece matching Extensions.png */
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

/** 5. Opportunities: Crisp 3D Isometric Cube matching Companies.png */
export function ReferenceCubeIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      {/* 3D Cube faces with white inner seam cutouts */}
      <path d="M10 2.2L16.8 5.8L10 9.4L3.2 5.8L10 2.2Z" fill="currentColor" />
      <path d="M3.2 6.4L9.4 9.7V17L3.2 13.5V6.4Z" fill="currentColor" />
      <path d="M10.6 9.7L16.8 6.4V13.5L10.6 17V9.7Z" fill="currentColor" />
    </IconFrame>
  )
}

/** 6. People: Contact ID badge matching People.png */
export function ReferencePeopleIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2.5" y="3" width="15" height="14" rx="2.5" fill="currentColor" />
      <circle cx="7" cy="8.25" r="2.2" fill="#FFFFFF" />
      <path d="M4.5 14.5C5.1 12.8 6.2 12 7.5 12C8.8 12 9.9 12.8 10.5 14.5H4.5Z" fill="#FFFFFF" />
      <rect x="11.5" y="7" width="4" height="1.8" rx="0.9" fill="#FFFFFF" />
      <rect x="11.5" y="10" width="4" height="1.8" rx="0.9" fill="#FFFFFF" />
      <rect x="11.5" y="13" width="2.5" height="1.8" rx="0.9" fill="#FFFFFF" />
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
      <circle cx="10" cy="10" r="8" fill="currentColor" />
      <path d="M7 10L9 12L13 7.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </IconFrame>
  )
}
