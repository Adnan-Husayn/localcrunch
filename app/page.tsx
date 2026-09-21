import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { PreviewMock } from "@/components/landing/preview-mock";

const GITHUB_URL = "https://github.com/Adnan-Husayn/localcrunch";

const FACTS = [
    ["0", "bytes uploaded"],
    ["10 MB", "streaming chunks"],
    ["27", "engine unit tests"],
    ["MIT", "open source license"],
];

const STEPS = [
    ["Drop in a CSV", "Or open the built-in sample. Column types are detected from the first rows straight away."],
    ["Read the profile", "Findings come first, then per-column statistics, distributions and the most common values."],
    ["Click to explore", "Filter to any value and the whole profile re-runs on just those rows. Export a report when you're done."],
];

const CHECKS = [
    ["Duplicate rows", "Exact copies of an earlier row, counted across the whole file."],
    ["Values that aren't numbers", "Text hiding in a column that otherwise looks numeric, like a stray \"N/A\" price."],
    ["Missing data", "Empty cells per column, flagged when a column is mostly empty."],
    ["Placeholders", "Values like N/A, null or - that usually stand in for something missing."],
    ["Outliers", "How much of a column falls outside the usual range, using the 1.5×IQR rule."],
    ["Constant and ID columns", "Columns with a single value, and columns where every value is unique."],
];

const INTERNALS = [
    ["Web Worker", "The engine runs off the main thread, so the page stays responsive on large files."],
    ["Chunk-safe parsing", "Rows split across chunk boundaries, newlines inside quoted fields and a last row with no trailing newline are all handled, and covered by unit tests."],
    ["One-pass statistics", "Mean and variance use Welford's algorithm. Medians, quartiles and histograms come from a 2,000-value reservoir sample."],
    ["Bounded memory", "Top values are capped at 1,000 distinct entries, and duplicates are tracked with 64-bit row fingerprints instead of the rows themselves."],
];

const LIMITS = [
    "CSV only for now: comma-separated, with a header row. No Excel, JSON or Parquet yet.",
    "On large files, medians, quartiles, outlier rates and histograms are estimates from a sample. Counts, minimum, maximum and mean are exact.",
    "Above 1,000 distinct values a column is marked high-cardinality and its top-value counts are a lower bound.",
    "Dates are recognized in YYYY-MM-DD format only.",
];

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const primaryButton = `inline-flex items-center justify-center gap-2 rounded-md bg-ink px-5 py-3 text-sm font-semibold text-canvas transition-colors hover:bg-accent-strong ${focus}`;
const secondaryButton = `inline-flex items-center justify-center gap-2 rounded-md border border-ink px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-sunken ${focus}`;

function Section({ id, n, title, children }: { id?: string; n: string; title: string; children: React.ReactNode }) {
    return (
        <section id={id} className="scroll-mt-4 border-t border-ink">
            <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-[12rem_1fr] md:gap-12 md:py-20">
                <h2 className="font-mono text-xs font-medium uppercase tracking-wider text-muted">
                    <span className="text-ink">{n}</span> / {title}
                </h2>
                <div>{children}</div>
            </div>
        </section>
    );
}

const statement = "max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.02em] text-balance sm:text-3xl";

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-canvas text-ink">
            <header className="border-b border-line">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
                    <Logo />
                    <nav aria-label="Main" className="flex items-center gap-1 sm:gap-3">
                        <a href="#how-it-works" className="hidden px-2 py-2 text-sm font-medium text-muted transition-colors hover:text-ink md:inline">
                            How it works
                        </a>
                        <a href="#under-the-hood" className="hidden px-2 py-2 text-sm font-medium text-muted transition-colors hover:text-ink md:inline">
                            Under the hood
                        </a>
                        <a href={GITHUB_URL} className="px-2 py-2 text-sm font-medium text-muted transition-colors hover:text-ink">
                            GitHub
                        </a>
                        <Link href="/analyze" className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-accent-strong">
                            Open profiler
                        </Link>
                    </nav>
                </div>
            </header>

            <main>
                {/* Hero */}
                <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 lg:pb-24 lg:pt-20">
                    <div className="grid items-start gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
                        <div>
                            <p className="font-mono text-xs font-medium uppercase tracking-wider text-muted">Private data profiler</p>
                            <h1 className="mt-5 text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[4.25rem]">
                                Know what&apos;s in your CSV <span className="mark">before you trust it.</span>
                            </h1>
                            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
                                Drop in a file and see column types, distributions, missing values, duplicates and data-quality problems. It runs in your browser, so the file never leaves your machine.
                            </p>
                            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                                <Link href="/analyze?sample=1" className={primaryButton}>
                                    Try it with sample data <ArrowRight className="h-4 w-4" />
                                </Link>
                                <Link href="/analyze" className={secondaryButton}>
                                    Use your own file
                                </Link>
                            </div>
                            <p className="mt-4 font-mono text-xs text-muted">No sign-up. The sample is 50,000 generated rows.</p>
                        </div>

                        <PreviewMock />
                    </div>
                </section>

                {/* Facts */}
                <section aria-label="At a glance" className="border-y border-ink">
                    <dl className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
                        {FACTS.map(([value, label], i) => (
                            <div
                                key={label}
                                className={`py-6 ${i % 2 === 1 ? "border-l border-line pl-5" : ""} ${i >= 2 ? "border-t border-line md:border-t-0" : ""} ${i > 0 ? "md:border-l md:border-line md:pl-6" : ""}`}
                            >
                                <dd className="font-mono text-3xl font-medium tracking-tight">{value}</dd>
                                <dt className="mt-1 text-sm text-muted">{label}</dt>
                            </div>
                        ))}
                    </dl>
                </section>

                <Section id="how-it-works" n="01" title="How it works">
                    <h3 className={statement}>Three steps, and none of them is an upload.</h3>
                    <ol className="mt-10 max-w-3xl">
                        {STEPS.map(([title, body], i) => (
                            <li key={title} className="grid grid-cols-[2.5rem_1fr] border-t border-line py-5">
                                <span className="font-mono text-sm text-muted">0{i + 1}</span>
                                <div>
                                    <h4 className="font-semibold">{title}</h4>
                                    <p className="mt-1 leading-relaxed text-muted">{body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </Section>

                <Section n="02" title="What it checks for">
                    <h3 className={statement}>The problems that quietly skew a chart or break an import.</h3>
                    <dl className="mt-10 grid gap-x-12 md:grid-cols-2">
                        {CHECKS.map(([term, detail]) => (
                            <div key={term} className="border-t border-line py-5">
                                <dt className="font-semibold">{term}</dt>
                                <dd className="mt-1 leading-relaxed text-muted">{detail}</dd>
                            </div>
                        ))}
                    </dl>
                </Section>

                <Section n="03" title="Private by design">
                    <h3 className={statement}>The site has no upload endpoint at all.</h3>
                    <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
                        Your file is read and analyzed inside your browser tab. There is no server that receives files, so sensitive exports like HR sheets, finance data and customer lists stay on your machine. Close the tab and it&apos;s gone.
                    </p>
                </Section>

                <Section id="under-the-hood" n="04" title="Under the hood">
                    <h3 className={statement}>Rust, compiled to WebAssembly, streaming the file in 10 MB chunks.</h3>
                    <dl className="mt-10 max-w-3xl">
                        {INTERNALS.map(([term, detail]) => (
                            <div key={term} className="grid gap-1 border-t border-line py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                                <dt className="font-mono text-sm font-medium">{term}</dt>
                                <dd className="leading-relaxed text-muted">{detail}</dd>
                            </div>
                        ))}
                    </dl>
                    <a href={GITHUB_URL} className={`${secondaryButton} mt-6`}>
                        Read the code on GitHub <ArrowRight className="h-4 w-4" />
                    </a>
                </Section>

                <Section n="05" title="Good to know">
                    <h3 className={statement}>What it doesn&apos;t do yet, so you aren&apos;t surprised.</h3>
                    <ul className="mt-8 max-w-3xl">
                        {LIMITS.map((limit) => (
                            <li key={limit} className="grid grid-cols-[1.5rem_1fr] border-t border-line py-4 leading-relaxed">
                                <span aria-hidden className="font-mono text-muted">–</span>
                                {limit}
                            </li>
                        ))}
                    </ul>
                </Section>

                {/* Closing call to action */}
                <section className="bg-ink text-canvas">
                    <div className="mx-auto grid max-w-6xl items-end gap-8 px-4 py-16 sm:px-6 md:grid-cols-[1fr_auto] md:py-24">
                        <div>
                            <h2 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
                                See it on 50,000 messy rows.
                            </h2>
                            <p className="mt-4 max-w-xl text-lg text-canvas/75">
                                The sample has duplicates, bad values and missing data planted in it, so you can watch the profiler catch them.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Link
                                href="/analyze?sample=1"
                                className="inline-flex items-center justify-center gap-2 rounded-md bg-mark px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                            >
                                Try it with sample data <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link
                                href="/analyze"
                                className="inline-flex items-center justify-center rounded-md border border-canvas/50 px-5 py-3 text-sm font-semibold text-canvas transition-colors hover:bg-canvas/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                            >
                                Use your own file
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-ink bg-canvas">
                <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 font-mono text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
                    <span>© 2026 Adnan Husayn. MIT License.</span>
                    <span className="flex gap-5">
                        <a href={GITHUB_URL} className="hover:text-ink">Source</a>
                        <Link href="/analyze" className="hover:text-ink">Profiler</Link>
                    </span>
                </div>
            </footer>
        </div>
    );
}
