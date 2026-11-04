interface Props {
  glyphs: readonly string[];
}

/**
 * Draws each glyph once, invisibly, so the browser rasterises the emoji before the game shows
 * them. Fixed and transparent, so it takes no room in the layout. The caller decides the list
 * (duplicates are kept on purpose).
 */
export default function EmojiWarm({ glyphs }: Props) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 flex whitespace-nowrap text-3xl font-emoji opacity-0 sm:text-4xl"
    >
      {glyphs.map((g, i) => (
        <span key={`${i}-${g}`} className="inline-block">
          {g}
        </span>
      ))}
    </div>
  );
}
