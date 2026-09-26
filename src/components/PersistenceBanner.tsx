export interface PersistenceNoticeItem {
  id: string
  message: string
}

export interface PersistenceBannerProps {
  notices: readonly PersistenceNoticeItem[]
  persistentWarning?: string | null
  onDismiss?: (id: string) => void
}

export function PersistenceBanner({
  notices,
  persistentWarning,
  onDismiss,
}: PersistenceBannerProps) {
  if (!persistentWarning && notices.length === 0) return null

  return (
    <aside className="persistence-banner" aria-label="Storage notices">
      {persistentWarning ? (
        <p className="persistence-warning" role="alert">
          {persistentWarning}
        </p>
      ) : null}

      {notices.length > 0 ? (
        <ul className="persistence-notice-list">
          {notices.map((notice) => (
            <li className="persistence-notice" key={notice.id}>
              <span>{notice.message}</span>
              <button
                type="button"
                className="persistence-notice-dismiss"
                onClick={() => onDismiss?.(notice.id)}
                aria-label={`Dismiss notice: ${notice.message}`}
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  )
}
