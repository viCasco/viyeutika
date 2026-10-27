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
    <path d="M10 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-8"/>
    <path d="M10 2v6H4"/>
    <path d="M10 2 4 8v2"/>
    <path d="M15 13H5"/>
    <path d="m8 10-3 3 3 3"/>
    <path d="M5 19h10"/>
    <path d="m12 16 3 3-3 3"/>
  </svg>
}
