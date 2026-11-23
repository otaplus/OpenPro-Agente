import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(text ?? '', { async: false }) as string
    return DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'iframe', 'form', 'input'],
      FORBID_ATTR: ['style', 'onerror', 'onclick']
    })
  }, [text])

  return (
    <div
      className="md"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(event) => {
        const anchor = (event.target as HTMLElement).closest('a')
        if (anchor) {
          event.preventDefault()
          const href = anchor.getAttribute('href')
          if (href && /^https?:\/\//i.test(href)) window.open(href, '_blank')
        }
      }}
    />
  )
}
