/** Compact left icon rail used as the primary navigation for the app shell. */
export function Nav<T extends string>({
  tabs,
  active,
  onSelect
}: {
  tabs: { id: T; label: string; icon: string }[]
  active: T
  onSelect: (id: T) => void
}): JSX.Element {
  return (
    <nav className="nav-rail">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`nav-item ${t.id === active ? 'active' : ''}`}
          onClick={() => onSelect(t.id)}
          title={t.label}
          aria-label={t.label}
          aria-current={t.id === active ? 'page' : undefined}
        >
          <span className="ico">{t.icon}</span>
          <span className="label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
