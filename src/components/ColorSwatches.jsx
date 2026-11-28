import { useLang } from '../i18n/LanguageContext'

export const COLOR_HEX = {
  Black: '#111111',
  White: '#ffffff',
  Navy: '#1f2a44',
  Charcoal: '#36454f',
  Red: '#c0392b',
  Olive: '#556b2f',
  'Heather Gray': '#b8bcc4',
}

export default function ColorSwatches({ colors, value, onChange, disabled = false }) {
  const { t } = useLang()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          onClick={() => onChange(color)}
          aria-label={t(`color.${color}`)}
          aria-pressed={value === color}
          className={`h-7 w-7 rounded-full border border-gray-300 transition focus-visible:ring-2 ring-indigo-500 disabled:opacity-50 ${
            value === color ? 'ring-2 ring-indigo-600 ring-offset-2' : ''
          }`}
          style={{ backgroundColor: COLOR_HEX[color] || '#111111' }}
        />
      ))}
    </div>
  )
}
