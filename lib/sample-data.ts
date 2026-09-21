// Generates a realistic-looking, slightly messy e-commerce orders CSV in the
// browser so the app can be tried without a file. The generator is seeded, so
// everyone sees the same data. It covers every column type the engine detects
// and has the kinds of problems a profiler should surface: missing values,
// "N/A" placeholders, a few non-numeric prices deep in the file, exact
// duplicate rows, a skewed numeric column and a high-cardinality column.

export const SAMPLE_FILE_NAME = "sample_orders.csv";

function mulberry32(seed: number) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type Weighted<T> = readonly [T, number][];

const SEGMENTS: Weighted<string> = [["Consumer", 0.6], ["Small Business", 0.28], ["Enterprise", 0.12]];
const REGIONS: Weighted<string> = [["North America", 0.38], ["Europe", 0.3], ["Asia Pacific", 0.22], ["Latin America", 0.1]];
const DISCOUNTS: Weighted<number> = [[0, 0.55], [0.05, 0.15], [0.1, 0.15], [0.15, 0.1], [0.2, 0.05]];
const CATEGORIES: Weighted<{ name: string; basePrice: number; returnRate: number }> = [
    [{ name: "Electronics", basePrice: 180, returnRate: 0.06 }, 0.2],
    [{ name: "Home & Kitchen", basePrice: 45, returnRate: 0.04 }, 0.24],
    [{ name: "Apparel", basePrice: 38, returnRate: 0.12 }, 0.26],
    [{ name: "Books", basePrice: 16, returnRate: 0.02 }, 0.12],
    [{ name: "Beauty", basePrice: 24, returnRate: 0.03 }, 0.1],
    [{ name: "Sports", basePrice: 60, returnRate: 0.05 }, 0.08],
];

// Relative order volume by month: quiet summer, big November/December.
const MONTH_WEIGHT = [0.8, 0.75, 0.85, 0.9, 0.9, 0.85, 0.8, 0.8, 0.9, 1.0, 1.35, 1.6];

export function generateSampleCsv(rowCount = 50_000): string {
    const rand = mulberry32(20240101);

    const pick = <T>(options: Weighted<T>): T => {
        let r = rand();
        for (const [value, weight] of options) {
            r -= weight;
            if (r <= 0) return value;
        }
        return options[options.length - 1][0];
    };

    const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

    const orderDate = () => {
        for (;;) {
            const day = Math.floor(rand() * 366);
            const d = new Date(Date.UTC(2024, 0, 1 + day));
            if (rand() < MONTH_WEIGHT[d.getUTCMonth()] / 1.6) return d.toISOString().slice(0, 10);
        }
    };

    const lines = ["order_id,order_date,customer_id,segment,category,region,quantity,unit_price,discount,revenue,returned,rating"];

    for (let i = 0; i < rowCount; i++) {
        const category = pick(CATEGORIES);
        const segment = pick(SEGMENTS);
        const quantity = Math.min(12, 1 + Math.floor(-Math.log(1 - rand()) * (segment === "Enterprise" ? 3 : 1.4)));
        const unitPrice = category.basePrice * Math.exp(normal() * 0.45);
        // A few bad prices, only after the first ~1 MB so type detection still
        // sees a clean decimal column and the engine finds them while streaming.
        const priceText = i > 15_000 && rand() < 0.0012 ? "N/A" : unitPrice.toFixed(2);
        const discount = pick(DISCOUNTS);
        const revenue = quantity * unitPrice * (1 - discount);
        const returned = rand() < category.returnRate;

        // Roughly a third of orders were never reviewed; returns skew low.
        let rating = "";
        if (rand() > 0.35) {
            const base = returned ? 2.4 : 4.1;
            rating = String(Math.max(1, Math.min(5, Math.round(base + normal() * 0.9))));
        }

        const regionRoll = rand();
        const region = regionRoll < 0.006 ? "N/A" : regionRoll < 0.026 ? "" : pick(REGIONS);

        const line = [
            10001 + i,
            orderDate(),
            `C${String(1 + Math.floor(rand() * 20_000)).padStart(5, "0")}`,
            segment,
            `"${category.name}"`,
            region,
            quantity,
            priceText,
            discount.toFixed(2),
            revenue.toFixed(2),
            returned,
            rating,
        ].join(",");

        lines.push(line);
        // Occasionally re-emit an earlier row, as a bad export or double submit would.
        if (i > 1_000 && rand() < 0.0012) lines.push(lines[1 + Math.floor(rand() * (lines.length - 1))]);
    }

    return lines.join("\n");
}

export function createSampleFile(): File {
    return new File([generateSampleCsv()], SAMPLE_FILE_NAME, { type: "text/csv" });
}
