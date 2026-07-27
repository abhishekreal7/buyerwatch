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

/** 1. Dashboard: 4 rounded squares (2 solid, 2 muted for high-end depth) */
export function ReferenceDashboardIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2" y="2" width="7" height="7" rx="2" fill="currentColor" />
      <rect x="11" y="2" width="7" height="7" rx="2" fill="currentColor" opacity="0.45" />
      <rect x="2" y="11" width="7" height="7" rx="2" fill="currentColor" opacity="0.45" />
      <rect x="11" y="11" width="7" height="7" rx="2" fill="currentColor" />
    </IconFrame>
  )
}

/** 2. Folder (Drafts Ready / Projects): Solid folder with tab and cutout */
export function ReferenceFolderIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M2 5C2 3.89543 2.89543 3 4 3H8C8.6 3 9.1 3.2 9.5 3.6L10.8 5H16C17.1046 5 18 5.89543 18 7V15C18 16.1046 17.1046 17 16 17H4C2.89543 17 2 16.1046 2 15V5Z"
        fill="currentColor"
      />
    </IconFrame>
  )
}

export function ReferenceBreadcrumbFolderIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M2 5C2 3.89543 2.89543 3 4 3H8C8.6 3 9.1 3.2 9.5 3.6L10.8 5H16C17.1046 5 18 5.89543 18 7V15C18 16.1046 17.1046 17 16 17H4C2.89543 17 2 16.1046 2 15V5Z"
        fill="currentColor"
      />
    </IconFrame>
  )
}

export function ReferenceBreadcrumbCurrentIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2" y="2" width="16" height="16" rx="5" fill="currentColor" />
      <circle cx="10" cy="10" r="3" fill="#FFF" />
    </IconFrame>
  )
}

/** 3. Analytics (Easel Chart / Histogram Board) */
export function ReferenceAnalyticsIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="2" y="3" width="16" height="11" rx="2" fill="currentColor" />
      <path d="M5 11L8.5 7.5L11.5 9.5L15 6" stroke="#FFF" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 17L9 14M13 17L11 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </IconFrame>
  )
}

export function ReferenceReportIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 3C4 2.44772 4.44772 2 5 2H12L16 6V17C16 17.5523 15.5523 18 15 18H5C4.44772 18 4 17.5523 4 17V3Z" fill="currentColor" />
      <rect x="7" y="9" width="6" height="1.5" rx="0.75" fill="#FFF" />
      <rect x="7" y="12.5" width="4" height="1.5" rx="0.75" fill="#FFF" />
    </IconFrame>
  )
}

/** 4. Keywords (Extensions / Puzzle piece) */
export function ReferencePuzzleIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M8.5 3H5C3.89543 3 3 3.89543 3 5V8.5C4.1 8.5 5 9.4 5 10.5C5 11.6 4.1 12.5 3 12.5V16C3 17.1046 3.89543 18 5 18H8.5C8.5 16.9 9.4 16 10.5 16C11.6 16 12.5 16.9 12.5 18H16C17.1046 18 18 17.1046 18 16V12.5C16.9 12.5 16 11.6 16 10.5C16 9.4 16.9 8.5 18 8.5V5C18 3.89543 17.1046 3 16 3H12.5C12.5 4.1 11.6 5 10.5 5C9.4 5 8.5 4.1 8.5 3Z"
        fill="currentColor"
      />
    </IconFrame>
  )
}

/** 5. Opportunities (Companies / 3D Isometric Cube with 3 shaded faces) */
export function ReferenceCubeIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      {/* Top Face - Light shading */}
      <path d="M10 2.5L16.5 6L10 9.5L3.5 6L10 2.5Z" fill="currentColor" opacity="0.45" />
      {/* Left Face - Mid shading */}
      <path d="M3.5 6L10 9.5V17L3.5 13.5V6Z" fill="currentColor" opacity="0.75" />
      {/* Right Face - Solid shading */}
      <path d="M10 9.5L16.5 6V13.5L10 17V9.5Z" fill="currentColor" />
    </IconFrame>
  )
}

export function ReferencePeopleIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M3 4.5C3 3.67157 3.67157 3 4.5 3H15.5C16.3284 3 17 3.67157 17 4.5V15.5C17 16.3284 16.3284 17 15.5 17H4.5C3.67157 17 3 16.3284 3 15.5V4.5Z" fill="currentColor" />
      <circle cx="7.5" cy="8" r="2" fill="#FFF" />
      <path d="M4.5 14C5 12.3 6.1 11.5 7.5 11.5C8.9 11.5 10 12.3 10.5 14H4.5Z" fill="#FFF" />
      <rect x="11.5" y="7" width="3.5" height="1.5" rx="0.75" fill="#FFF" opacity="0.8" />
      <rect x="11.5" y="10" width="3.5" height="1.5" rx="0.75" fill="#FFF" opacity="0.6" />
    </IconFrame>
  )
}

/** 6. Posted (Send / Paper Airplane) */
export function ReferencePostedIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M2.5 9.5L17.5 3L11.5 17.5L9 11.5L2.5 9.5Z" fill="currentColor" />
      <path d="M9 11.5L17.5 3" stroke="#FFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconFrame>
  )
}

export function ReferenceCheckIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="10" cy="10" r="8" fill="currentColor" opacity="0.15" />
      <circle cx="10" cy="10" r="6.5" fill="currentColor" />
      <path d="M7 10L9 12L13 7.5" stroke="#FFF" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </IconFrame>
  )
}
