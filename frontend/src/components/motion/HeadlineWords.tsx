/**
 * A display headline's words, each set as its own piece so it can drop in on its own beat.
 *
 * Handles: splitting a line into words, each an inline block marked data-word (what the opening sequence and the
 * sign-in pages' word drop select) and carrying its own warm-white gradient text. Every word paints its own gradient
 * because a word moving on its own layer inside one background-clip: text parent drops out of that parent's clip;
 * each is padded by 0.1em (and pulled back by a matching margin) so its descenders stay inside the box its gradient
 * paints.
 */
export const WORD_CLASS =
  "inline-block bg-gradient-to-b from-[hsl(40_33.4%_98.9%)] to-[hsl(40_10.1%_85.6%)] bg-clip-text pb-[0.1em] -mb-[0.1em] text-transparent";

export function HeadlineWords({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, index) => (
        <span key={index}>
          {index > 0 && " "}
          <span data-word className={WORD_CLASS}>
            {word}
          </span>
        </span>
      ))}
    </>
  );
}
