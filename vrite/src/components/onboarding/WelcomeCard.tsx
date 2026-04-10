import { Sparkles, WandSparkles, ArrowRight } from 'lucide-react';

interface WelcomeCardProps {
  isLoading: boolean;
  onStart: () => void;
  onSkip: () => void;
}

export default function WelcomeCard({ isLoading, onStart, onSkip }: WelcomeCardProps) {
  return (
    <section className="onboarding-welcome-card" aria-label="Get started with AI onboarding">
      <p className="onboarding-welcome-eyebrow">First-time setup</p>
      <h3 className="onboarding-welcome-title">Create your first polished draft in seconds.</h3>
      <p className="onboarding-welcome-body">
        Start with one guided AI pass, then review changes and style the result your way.
      </p>

      <div className="onboarding-welcome-chip-row" aria-hidden>
        <span className="onboarding-welcome-chip">
          <Sparkles size={14} />
          Smart edits
        </span>
        <span className="onboarding-welcome-chip">
          <WandSparkles size={14} />
          Instant structure
        </span>
      </div>

      <div className="onboarding-welcome-actions">
        <button
          type="button"
          className="onboarding-welcome-primary"
          onClick={onStart}
          disabled={isLoading}
        >
          Generate first draft
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="onboarding-welcome-secondary"
          onClick={onSkip}
          disabled={isLoading}
        >
          Skip onboarding
        </button>
      </div>
    </section>
  );
}
