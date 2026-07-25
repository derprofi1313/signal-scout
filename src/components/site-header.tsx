import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <Link className="site-mark" href="/" aria-label="Signal Scout home">
          <span className="site-mark__glyph" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Signal Scout</span>
        </Link>
        <nav aria-label="Primary navigation">
          <ul>
            <li>
              <Link href="/demo">Evidence demo</Link>
            </li>
            <li>
              <a
                href="https://github.com/derprofi1313/signal-scout/tree/main/docs"
                rel="noreferrer"
              >
                Docs
              </a>
            </li>
            <li>
              <a href="https://github.com/derprofi1313/signal-scout" rel="noreferrer">
                GitHub
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
