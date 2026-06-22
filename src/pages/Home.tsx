import { Link } from 'react-router-dom';
import {
  TOOLS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type ToolDef,
} from '@/tools/registry';
import './Home.css';

export function Home() {
  return (
    <div className="container home">
      <section className="hero">
        <h1 className="hero__title">
          Every PDF tool you need, <span>right in your browser</span>
        </h1>
        <p className="hero__subtitle">
          Edit, sign, organize, convert and secure your documents. Fast, free,
          and fully private — your files never leave your device.
        </p>
      </section>

      {CATEGORY_ORDER.map((category) => {
        const tools = TOOLS.filter((t) => t.category === category);
        if (tools.length === 0) return null;
        return (
          <section key={category} className="tool-section">
            <h2 className="tool-section__title">{CATEGORY_LABELS[category]}</h2>
            <div className="tool-grid">
              {tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolDef }) {
  const inner = (
    <>
      <span className="tool-card__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d={tool.icon} />
        </svg>
      </span>
      <div className="tool-card__body">
        <div className="tool-card__title-row">
          <h3 className="tool-card__title">{tool.title}</h3>
          {tool.status === 'soon' && (
            <span className="tool-card__badge">Soon</span>
          )}
        </div>
        <p className="tool-card__desc">{tool.description}</p>
      </div>
    </>
  );

  if (tool.status === 'soon') {
    return (
      <div
        className="tool-card tool-card--disabled"
        aria-disabled="true"
        title="Coming soon"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link to={`/tools/${tool.id}`} className="tool-card">
      {inner}
    </Link>
  );
}
