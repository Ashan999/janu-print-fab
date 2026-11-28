import { useState } from 'react'
import { X } from 'lucide-react'
import { normalizeKeywords } from '../lib/productKeywords'

export default function KeywordEditor({ value, onChange, suggestions = [] }) {
  const [draft, setDraft] = useState('')
  const existing = new Set(value.map((keyword) => keyword.toLocaleLowerCase()))
  const matchingSuggestions = normalizeKeywords(suggestions).filter(
    (keyword) =>
      !existing.has(keyword.toLocaleLowerCase()) &&
      (!draft.trim() || keyword.toLocaleLowerCase().includes(draft.trim().toLocaleLowerCase()))
  ).slice(0, 6)

  const addKeywords = (text) => {
    const additions = normalizeKeywords([text])
    if (additions.length) onChange(normalizeKeywords([...value, ...additions]))
    setDraft('')
  }

  return (
    <div>
      <label className="text-xs font-medium text-gray-700">Search keywords</label>
      <input
        type="text"
        value={draft}
        onChange={(event) => {
          const parts = event.target.value.split(',')
          if (parts.length > 1) {
            addKeywords(parts.slice(0, -1).join(','))
            setDraft(parts.at(-1))
          } else {
            setDraft(event.target.value)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            addKeywords(draft)
          } else if (event.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => {
          if (draft.trim()) addKeywords(draft)
        }}
        placeholder="e.g. animals, flowers, K drama"
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
      />
      <p className="mt-1 text-xs text-gray-500">
        Press Enter or type a comma to add a keyword. Saved keywords will be suggested next time.
      </p>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((keyword) => (
            <span
              key={keyword}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800"
            >
              {keyword}
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== keyword))}
                aria-label={`Remove ${keyword}`}
                className="rounded-full hover:text-red-700 focus-visible:outline-2 focus-visible:outline-indigo-600"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {matchingSuggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Saved keyword suggestions">
          {matchingSuggestions.map((keyword) => (
            <button
              key={keyword}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addKeywords(keyword)}
              className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:border-indigo-300 hover:bg-indigo-50"
            >
              + {keyword}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
