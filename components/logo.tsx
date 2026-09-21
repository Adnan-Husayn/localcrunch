import Link from "next/link";

export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
            <rect width="32" height="32" rx="3" fill="#121211" />
            <path d="M9.5 23V16M22.5 23V13" stroke="#f4f4f1" strokeWidth="3.4" strokeLinecap="butt" />
            <path d="M16 23V8" stroke="#ffe14a" strokeWidth="3.4" strokeLinecap="butt" />
        </svg>
    );
}

export function Logo({ tagline = false }: { tagline?: boolean }) {
    return (
        <Link href="/" className="flex items-center gap-2.5" aria-label="LocalCrunch home">
            <LogoMark />
            <span className="text-base font-semibold tracking-tight text-ink">LocalCrunch</span>
            {tagline && <span className="hidden font-mono text-xs uppercase tracking-wider text-muted sm:inline">Private data profiler</span>}
        </Link>
    );
}
