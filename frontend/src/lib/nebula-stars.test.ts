/**
 * Tests for the stars round the nebula.
 *
 * Handles: pinning that a window gets a sensible number of stars whatever its size, that the same seed always draws
 * the same sky and another seed a different one, that every star lands inside the window, that about 65 in every 100
 * stand in the upper half and that they thin out behind the headline, that only a few stand out with a cross of light while most are faint points,
 * and that the list comes back grouped by tint.
 */
import { describe, expect, it } from "vitest";
import { STAR_TINTS, TOP_SHARE, scatterStars, starCount, starWeight } from "./nebula-stars";

describe("starCount", () => {
    it("grows with the window and stays within bounds", () => {
        expect(starCount(320, 480)).toBe(70);
        expect(starCount(1440, 900)).toBeGreaterThan(starCount(1024, 700));
        expect(starCount(5120, 2880)).toBe(500);
    });
});

describe("starWeight", () => {
    it("is lightest behind the headline and even everywhere else", () => {
        expect(starWeight(0.1, 0.9)).toBeCloseTo(starWeight(0.1, 0.05));
        expect(starWeight(0.5, 0.3)).toBeLessThan(starWeight(0.05, 0.3));
        expect(starWeight(0.5, 0.9)).toBeCloseTo(starWeight(0.05, 0.9));
    });

    it("never empties any part of the sky", () => {
        for (let x = 0; x <= 1; x += 0.1) {
            for (let y = 0; y <= 1; y += 0.1) {
                expect(starWeight(x, y)).toBeGreaterThan(0.05);
                expect(starWeight(x, y)).toBeLessThanOrEqual(1);
            }
        }
    });
});

describe("scatterStars", () => {
    it("draws the same sky for the same seed and a different one for another", () => {
        expect(scatterStars(120, 7)).toEqual(scatterStars(120, 7));
        expect(scatterStars(120, 7)).not.toEqual(scatterStars(120, 8));
    });

    it("places every star inside the window", () => {
        const stars = scatterStars(300);
        expect(stars).toHaveLength(300);
        for (const star of stars) {
            expect(star.x).toBeGreaterThanOrEqual(0);
            expect(star.x).toBeLessThan(1);
            expect(star.y).toBeGreaterThanOrEqual(0);
            expect(star.y).toBeLessThan(1);
        }
    });

    it("puts about 65 stars in every 100 in the upper half", () => {
        const stars = scatterStars(400);
        const high = stars.filter((star) => star.y < 0.5).length / stars.length;
        expect(TOP_SHARE).toBe(0.65);
        expect(high).toBeGreaterThan(0.6);
        expect(high).toBeLessThan(0.7);
    });

    it("lets only a few stars flare and keeps most of them faint points", () => {
        const stars = scatterStars(300);
        const flares = stars.filter((star) => star.flare).length;
        expect(flares).toBeGreaterThan(0);
        expect(flares).toBeLessThan(stars.length * 0.1);
        expect(stars.filter((star) => star.halo === 0).length).toBeGreaterThan(stars.length * 0.7);
    });

    it("comes back grouped by tint, each a tint the sky has", () => {
        const tints = scatterStars(300).map((star) => star.tint);
        expect(tints).toEqual([...tints].sort((a, b) => a - b));
        expect(Math.max(...tints)).toBeLessThan(STAR_TINTS.length);
    });
});
