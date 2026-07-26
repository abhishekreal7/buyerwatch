import type { SVGProps } from 'react'

type SidebarReferenceIconProps = SVGProps<SVGSVGElement> & {
  title?: string
}

function IconFrame({ title, children, ...props }: SidebarReferenceIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
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

export function ReferenceDashboardIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="4.25" y="5.25" width="8.45" height="5.85" rx="1.45" fill="currentColor" />
      <rect x="4.25" y="12.9" width="8.45" height="5.85" rx="1.45" fill="currentColor" />
      <rect x="14.35" y="6.65" width="5.4" height="10.7" rx="1.45" fill="currentColor" />
    </IconFrame>
  )
}

export function ReferenceFolderIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M3.55 7.2c0-.88.72-1.6 1.6-1.6h5.2c.56 0 1.08.29 1.37.77l.67 1.1h6.46c.88 0 1.6.72 1.6 1.6v.82H3.55V7.2Z"
        fill="currentColor"
      />
      <path
        d="M3.55 10.55h16.9v6.7c0 .88-.72 1.6-1.6 1.6H5.15c-.88 0-1.6-.72-1.6-1.6v-6.7Z"
        fill="currentColor"
      />
    </IconFrame>
  )
}

export function ReferenceBreadcrumbFolderIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M3.65 7.55c0-.72.58-1.3 1.3-1.3h5.1c.45 0 .86.23 1.1.6l.48.78h7.42c.72 0 1.3.58 1.3 1.3v1H3.65V7.55Z"
        fill="currentColor"
        opacity=".88"
      />
      <path
        d="M3.65 10.5h16.7v5.95c0 .72-.58 1.3-1.3 1.3H4.95c-.72 0-1.3-.58-1.3-1.3V10.5Z"
        fill="currentColor"
      />
      <path d="M4.35 9.95h15.3" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".45" />
    </IconFrame>
  )
}

export function ReferenceBreadcrumbCurrentIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="3.65" y="3.65" width="16.7" height="16.7" rx="5" fill="currentColor" />
      <path
        d="M12 6.65c.64 0 1.15.51 1.15 1.15v.34c0 .33.2.63.51.75.22.09.44.18.65.28.3.14.65.08.88-.15l.24-.24c.45-.45 1.18-.45 1.63 0l.16.16c.45.45.45 1.18 0 1.63l-.24.24c-.23.23-.29.58-.15.88.1.21.19.43.28.65.12.31.42.51.75.51h.34c.64 0 1.15.51 1.15 1.15v.22c0 .64-.51 1.15-1.15 1.15h-.34c-.33 0-.63.2-.75.51-.09.22-.18.44-.28.65-.14.3-.08.65.15.88l.24.24c.45.45.45 1.18 0 1.63l-.16.16c-.45.45-1.18.45-1.63 0l-.24-.24c-.23-.23-.58-.29-.88-.15-.21.1-.43.19-.65.28-.31.12-.51.42-.51.75v.34c0 .64-.51 1.15-1.15 1.15h-.22c-.64 0-1.15-.51-1.15-1.15v-.34c0-.33-.2-.63-.51-.75-.22-.09-.44-.18-.65-.28-.3-.14-.65-.08-.88.15l-.24.24c-.45.45-1.18.45-1.63 0l-.16-.16c-.45-.45-.45-1.18 0-1.63l.24-.24c.23-.23.29-.58.15-.88a6.04 6.04 0 0 1-.28-.65.8.8 0 0 0-.75-.51H5.8c-.64 0-1.15-.51-1.15-1.15V14c0-.64.51-1.15 1.15-1.15h.34c.33 0 .63-.2.75-.51.09-.22.18-.44.28-.65.14-.3.08-.65-.15-.88l-.24-.24c-.45-.45-.45-1.18 0-1.63l.16-.16c.45-.45 1.18-.45 1.63 0l.24.24c.23.23.58.29.88.15.21-.1.43-.19.65-.28.31-.12.51-.42.51-.75V7.8c0-.64.51-1.15 1.15-1.15H12Z"
        fill="#fff"
      />
      <circle cx="12" cy="12" r="2.25" fill="currentColor" />
    </IconFrame>
  )
}

export function ReferenceAnalyticsIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M5.25 4.85h13.5c.94 0 1.7.76 1.7 1.7v8.85c0 .94-.76 1.7-1.7 1.7H5.25c-.94 0-1.7-.76-1.7-1.7V6.55c0-.94.76-1.7 1.7-1.7Z"
        fill="currentColor"
      />
      <path
        d="m6.85 12.75 3.08-2.98 2.36 2.04 4.64-4.52"
        stroke="#fff"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.4 14.35h7.2" stroke="#fff" strokeWidth="1.15" strokeLinecap="round" opacity=".52" />
      <path d="M12 16.75v2.1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M9.15 19.15h5.7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </IconFrame>
  )
}

export function ReferenceReportIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M6.25 4.35h8.7l3.1 3.1v11.2c0 .83-.67 1.5-1.5 1.5H6.25c-.83 0-1.5-.67-1.5-1.5V5.85c0-.83.67-1.5 1.5-1.5Z"
        fill="currentColor"
      />
      <path d="M14.75 4.7v2.65c0 .72.58 1.3 1.3 1.3h2.6" fill="#fff" opacity=".78" />
      <rect x="7.55" y="10.5" width="7.85" height="1.35" rx=".68" fill="#fff" />
      <rect x="7.55" y="13.25" width="7.85" height="1.35" rx=".68" fill="#fff" opacity=".82" />
      <rect x="7.55" y="16" width="5.25" height="1.35" rx=".68" fill="#fff" opacity=".82" />
    </IconFrame>
  )
}

export function ReferencePuzzleIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M7.64 7.29h4.51c.35 0 .6-.27.6-.6 0-.22-.09-.43-.24-.61-.6-.7-.83-1.54-.58-2.3.29-.89 1.14-1.4 2.03-1.28 1.12.15 1.95 1.1 1.98 2.22.02.6-.18 1.16-.56 1.62-.18.22-.28.46-.28.67 0 .17.15.28.34.28h5.13c.51 0 .93.42.93.93v4.29c0 .62-.68.99-1.2.64-.52-.36-1.11-.87-1.87-.87-.9 0-1.63.73-1.63 1.63s.73 1.63 1.63 1.63c.7 0 1.29-.43 1.84-.77.56-.35 1.23.03 1.23.65v5.03c0 .58-.47 1.05-1.05 1.05h-5.3c-.6 0-.96-.68-.61-1.16.41-.56.85-1.11.85-1.82 0-.91-.74-1.65-1.65-1.65s-1.65.74-1.65 1.65c0 .71.43 1.28.82 1.83.35.49-.02 1.15-.61 1.15H7.64c-.52 0-.94-.42-.94-.94v-4.87c0-.57-.63-.9-1.13-.59-.51.32-1.02.68-1.68.68-.9 0-1.64-.73-1.64-1.64s.74-1.64 1.64-1.64c.67 0 1.18.37 1.69.69.5.31 1.12-.03 1.12-.6V8.22c0-.51.42-.93.94-.93Z"
        fill="currentColor"
      />
    </IconFrame>
  )
}

export function ReferenceCubeIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 3.4 20.1 7.9 12 12.45 3.9 7.9 12 3.4Z" fill="currentColor" />
      <path d="M4.45 9.1 11.2 12.9v7.7l-6.75-3.82V9.1Z" fill="currentColor" opacity=".9" />
      <path d="M19.55 9.1 12.8 12.9v7.7l6.75-3.82V9.1Z" fill="currentColor" opacity=".72" />
      <path d="M12 12.45v7.65" stroke="#fff" strokeWidth="1.35" strokeLinecap="round" opacity=".9" />
      <path d="M5.1 8.28 12 12.18l6.9-3.9" stroke="#fff" strokeWidth="1.35" strokeLinejoin="round" opacity=".78" />
    </IconFrame>
  )
}

export function ReferencePeopleIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <rect x="3.85" y="5.6" width="16.3" height="12.8" rx="2.1" fill="currentColor" />
      <circle cx="8.85" cy="10" r="1.95" fill="#fff" />
      <path
        d="M5.95 15.18c.5-1.42 1.62-2.25 2.9-2.25 1.3 0 2.42.83 2.92 2.25.13.38-.16.77-.56.77H6.5c-.4 0-.68-.39-.55-.77Z"
        fill="#fff"
      />
      <rect x="13.2" y="8.6" width="4.15" height="1.4" rx=".7" fill="#fff" opacity=".9" />
      <rect x="13.2" y="12.1" width="4.95" height="1.4" rx=".7" fill="#fff" opacity=".72" />
      <rect x="13.2" y="15.6" width="3.3" height="1.35" rx=".68" fill="#fff" opacity=".72" />
    </IconFrame>
  )
}

export function ReferencePostedIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M3.75 11.45 18.95 4.6c.83-.38 1.68.47 1.3 1.3l-6.85 15.2c-.38.84-1.6.79-1.9-.08l-1.78-5.1a1.15 1.15 0 0 0-.72-.72l-5.1-1.78c-.87-.3-.93-1.59-.15-1.97Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m9.86 15.08 5.55-5.55"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m7.52 14.7.08 3.26c.03.96 1.18 1.43 1.87.77l1.86-1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconFrame>
  )
}

export function ReferenceCheckIcon(props: SidebarReferenceIconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="8.05" fill="currentColor" />
      <path
        d="m8.35 12.05 2.25 2.25 5.05-5.1"
        stroke="#fff"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconFrame>
  )
}
