import type { SVGProps } from 'react'

export function ImportExportIcon({size=24,...props}:SVGProps<SVGSVGElement>&{size?:number|string}) {
  return <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8"/>
    <path d="M14 2v6h6"/>
    <path d="M14 2l6 6v2"/>
    <path d="M9 13h10"/>
    <path d="m16 10 3 3-3 3"/>
    <path d="M19 19H9"/>
    <path d="m12 16-3 3 3 3"/>
  </svg>
}
