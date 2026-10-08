/**
 * The build chat's tagged text as chat events, recomputed as an answer arrives.
 *
 * Handles: nothing of its own beyond memoising the reading per text - what the text means lives in
 * lib/generation-protocol.ts, which the chat store and the reveal read from too.
 *
 * It used to hold the parser. That moved out when the parser became the one reading of the protocol in the browser:
 * logic that the API layer and the store also need has no business living in a hook.
 */
import { useMemo } from 'react';
import { parseGenerationText } from '@/lib/generation-protocol';

export { findSafeEnd, findVisibleRanges } from '@/lib/generation-protocol';

export const useStreamParser = (streamBuffer: string) =>
  useMemo(() => parseGenerationText(streamBuffer, { streaming: true }), [streamBuffer]);
