/**
 * The stars of the signed-in pages' sky: where each one is, how big and bright, what colour, and how it twinkles.
 *
 * Handles: how many stars a window of a given size gets, the share that go to the upper half, the weight that thins
 * them behind the copy, the seeded scatter
 * that places them, and sorting them into three kinds - the fine dust of faint points most of them are, a share of
 * brighter ones that carry a soft halo, and a few that stand out with a halo and a thin cross of light, as a bright
 * star does in a photograph of a nebula.
 *
 * The owner asked for the stars to stand mostly in the dark upper sky and less over the colour at the foot - "65-35"
 * - so each star is first dealt to the upper half of the window (TOP_SHARE of them) or the lower, and then placed
 * within that half; they had been thickest low down, round the nebula of gas this sky used to have. Within the
 * upper half they are thinner in the middle column, where the headline and the prompt sit, since an even dusting
 * behind the copy read as noise on the landing page (starWeight). Positions are fractions of the window, so the same
 * sky stretches to any size, and the scatter is seeded, so it is the same sky on every visit and does not reshuffle
 * on a resize. Most stars are warm white or pale gold; a few are a pale blue-white, the cool counterpoint real star
 * fields have. The list comes back sorted by tint, so drawing changes its fill colour only a
 * handful of times. The owner asked for more stars once the nebula's gas had given way to a wash of colour, so a
 * window got about twice what it had; that was too many, and it settled at about half as many again (one to every
 * 3,600 square pixels, where it was 5,200).
 */

export interface NebulaStar {
    x: number;
    y: number;
    radius: number;
    alpha: number;
    tint: number;
    phase: number;
    pace: number;
    halo: number;
    flare: boolean;
}

export const STAR_TINTS = ["255, 250, 240", "255, 234, 200", "255, 208, 152", "214, 230, 255"];

const AREA_PER_STAR = 3600;
const MIN_STARS = 70;
const MAX_STARS = 500;
const BRIGHT_SHARE = 0.035;
const HALO_SHARE = 0.15;

export const TOP_SHARE = 0.65;

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);
const smooth = (t: number) => t * t * (3 - 2 * t);

function seeded(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function starCount(width: number, height: number) {
    return Math.min(MAX_STARS, Math.max(MIN_STARS, Math.round((width * height) / AREA_PER_STAR)));
}

export function starWeight(x: number, y: number) {
    const off = Math.abs(x - 0.5) * 2;
    const column = 0.3 + 0.7 * smooth(clamp((off - 0.3) / 0.4));
    return column + (1 - column) * smooth(clamp((y - 0.5) / 0.18));
}

export function scatterStars(count: number, seed = 7): NebulaStar[] {
    const random = seeded(seed);
    const between = (low: number, high: number) => low + random() * (high - low);
    const stars: NebulaStar[] = [];
    while (stars.length < count) {
        const foot = random() < TOP_SHARE ? 0 : 0.5;
        let x = random();
        let y = foot + random() * 0.5;
        while (random() > starWeight(x, y)) {
            x = random();
            y = foot + random() * 0.5;
        }
        const kind = random();
        const bright = kind < BRIGHT_SHARE;
        const haloed = kind < BRIGHT_SHARE + HALO_SHARE;
        const pick = random();
        stars.push({
            x,
            y,
            radius: bright ? between(1.25, 1.7) : haloed ? between(0.85, 1.2) : between(0.4, 0.8),
            alpha: bright ? between(0.9, 1) : haloed ? between(0.65, 0.9) : between(0.28, 0.7),
            tint: pick < 0.46 ? 0 : pick < 0.74 ? 1 : pick < 0.88 ? 2 : 3,
            phase: between(0, Math.PI * 2),
            pace: between(0.0004, 0.0012),
            halo: bright ? between(7, 9.5) : haloed ? between(3.2, 4.6) : 0,
            flare: bright,
        });
    }
    return stars.sort((a, b) => a.tint - b.tint);
}
