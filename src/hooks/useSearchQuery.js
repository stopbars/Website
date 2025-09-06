import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * useSearchQuery
 * Sync a search term with the URL ?q= parameter.
 * - Reads initial value from URL on mount
 * - Updates URL as the user types (debounced)
 * - Responds to back/forward navigation changes
 *
 * @param {object} options
 * @param {string} [options.paramName='q'] - The query string parameter to sync
 * @param {number} [options.debounceMs=300] - Debounce delay for URL updates
 * @param {string} [options.initial=''] - Fallback initial value when URL has no param
 * @returns {[string, function]} [query, setQuery]
 */
export default function useSearchQuery(options = {}) {
  const { paramName = 'q', debounceMs = 300, initial = '' } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  // Read once on mount from URL (or provided initial)
  const initialFromUrl = useMemo(() => {
    const v = searchParams.get(paramName);
    return v ?? initial;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [query, setQuery] = useState(initialFromUrl);
  const debounceTimer = useRef(null);

  // When URL changes due to navigation (back/forward), keep local state in sync
  useEffect(() => {
    const urlVal = searchParams.get(paramName) ?? '';
    if (urlVal !== (query ?? '')) {
      setQuery(urlVal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Write to URL when local state changes (debounced)
  useEffect(() => {
    const trimmed = (query ?? '').trim();

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      const current = searchParams.get(paramName) ?? '';
      if (current === trimmed) return; // avoid redundant updates

      const next = new URLSearchParams(searchParams);
      if (trimmed) next.set(paramName, trimmed); else next.delete(paramName);
      setSearchParams(next, { replace: true });
    }, debounceMs);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return [query, setQuery];
}
