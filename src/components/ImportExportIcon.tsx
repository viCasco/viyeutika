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
    <path d="M8 2h6l6 6v12a2 2 0 0 1-2 2H8"/>
    <path d="M14 2v6h6"/>
    <path d="M15 13H5"/>
    <path d="m8 10-3 3 3 3"/>
    <path d="M5 19h10"/>
    <path d="m12 16 3 3-3 3"/>
  </svg>
}
