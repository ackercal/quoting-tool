// Quoter brand mark: a bold orange dollar sign.
export default function QuoterLogo({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M336 188 C336 162 306 144 266 144 C220 144 190 170 190 206 C190 240 220 256 264 268 C312 282 338 300 338 336 C338 374 306 396 262 396 C222 396 190 378 178 350"
        stroke="#FF9900"
        strokeWidth="44"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M256 104 L256 436" stroke="#FF9900" strokeWidth="26" strokeLinecap="round" />
    </svg>
  );
}
