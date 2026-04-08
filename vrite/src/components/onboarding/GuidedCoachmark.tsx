import { useId, useEffect, type CSSProperties } from 'react';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type CoachmarkStage = 'welcome' | 'firstDiff' | 'formattingHint';

interface GuidedCoachmarkProps {
  stage: CoachmarkStage;
  targetRect: SpotlightRect | null;
  guidedDiffReviewCount?: number;
  requiredGuidedDiffReviews?: number;
  onSkip: () => void;
  onFinish: () => void;
}

export default function GuidedCoachmark({
  stage,
  targetRect,
  guidedDiffReviewCount = 0,
  requiredGuidedDiffReviews = 3,
  onSkip,
  onFinish,
}: GuidedCoachmarkProps) {
  const spotlightMaskId = useId().replace(/:/g, '');
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  
  // Use different corner radius based on the stage
  // AI sidebar has no border radius, so use 0 for welcome stage
  const spotlightCornerRadius = stage === 'welcome' ? 0 : 20;
  
  const spotlight = targetRect
    ? {
        top: Math.max(8, targetRect.top - 12),
        left: Math.max(8, targetRect.left - 12),
        width: Math.max(0, targetRect.width + 24),
        height: Math.max(0, targetRect.height + 24),
      }
    : null;

  // Elevate the z-index of the target element(s) to appear above the backdrop
  useEffect(() => {
    if (!stage) return;

    const applyElevation = () => {
      // Remove class from all previously elevated elements
      document.querySelectorAll('.onboarding-spotlight-target').forEach((el) => {
        el.classList.remove('onboarding-spotlight-target');
      });

      const targetElements: HTMLElement[] = [];

      if (stage === 'welcome') {
        const element = document.querySelector('[data-onboarding-target="assistant-sidebar"]') as HTMLElement | null;
        if (element) targetElements.push(element);
      } else       if (stage === 'firstDiff') {
        if (guidedDiffReviewCount >= requiredGuidedDiffReviews) {
          const element = (
            document.querySelector('[data-onboarding-target="accept-all"]') ||
            document.querySelector('[data-onboarding-target="diff-actions"]')
          ) as HTMLElement | null;
          if (element) targetElements.push(element);
          // The Accept All button sits inside .ai-sidebar which has
          // transform: translateX(0) — this creates a stacking context that
          // traps z-index, so the button can't escape the backdrop at z-140.
          // Elevating the sidebar shell to z-145 breaks it out so the button
          // is actually clickable.
          const sidebarShell = document.querySelector(
            '[data-onboarding-target="assistant-sidebar"]'
          ) as HTMLElement | null;
          if (sidebarShell) targetElements.push(sidebarShell);
        } else {
          // Apply to ALL inline diff action buttons, not just the first one
          const elements = document.querySelectorAll('[data-onboarding-target="inline-diff-actions"]');
          elements.forEach((el) => {
            targetElements.push(el as HTMLElement);
            // Also elevate the parent diff node span
            const parentSpan = (el as HTMLElement).closest('.diff-inline, .diff-word');
            if (parentSpan) {
              targetElements.push(parentSpan as HTMLElement);
            }
          });
        }
      } else if (stage === 'formattingHint') {
        const element = document.querySelector('[data-onboarding-target="formatting-toolbar"]') as HTMLElement | null;
        if (element) targetElements.push(element);
      }

      // Add class to elevate z-index above the backdrop for all target elements
      targetElements.forEach((element) => {
        element.classList.add('onboarding-spotlight-target');
      });
    };

    applyElevation();

    // Set up MutationObserver to re-apply elevation when DOM changes (diffs added/removed)
    let observer: MutationObserver | null = null;
    if (stage === 'firstDiff' && guidedDiffReviewCount < requiredGuidedDiffReviews) {
      const editorRoot = document.querySelector('.document-content-editable') || document.body;
      observer = new MutationObserver(() => {
        applyElevation();
      });
      observer.observe(editorRoot, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      // Remove class on cleanup
      document.querySelectorAll('.onboarding-spotlight-target').forEach((el) => {
        el.classList.remove('onboarding-spotlight-target');
      });
      observer?.disconnect();
    };
  }, [stage, guidedDiffReviewCount, requiredGuidedDiffReviews]);

  const remainingGuidedDiffReviews = Math.max(0, requiredGuidedDiffReviews - guidedDiffReviewCount);
  const hasCompletedGuidedDiffReviews = remainingGuidedDiffReviews === 0;

  const content =
    stage === 'welcome'
      ? {
          progress: '1/3',
          title: 'Meet your AI writing agent',
          body: 'With your context, the agent can write full drafts, format your document, insert images and equations, and a lot more.',
          hint: 'Your first draft has been generated — explore the changes below.',
          primaryLabel: null,
        }
      : stage === 'firstDiff'
        ? hasCompletedGuidedDiffReviews
          ? {
              progress: '2/3',
              title: 'Apply the rest with Accept All',
              body: 'Nice work. Head to the chat panel and click Accept All to apply the remaining changes at once.',
              hint: "You're in control — accept what fits, reject what doesn't.",
              primaryLabel: null,
            }
          : {
              progress: '2/3',
              title: `Review ${remainingGuidedDiffReviews} more diff${remainingGuidedDiffReviews === 1 ? '' : 's'}`,
              body: 'You have full control over every change. Accept or reject each one directly in the document.',
              hint: 'After this, you can apply or dismiss the rest all at once.',
              primaryLabel: null,
            }
        : {
            progress: '3/3',
            title: 'Try one formatting control',
            body: 'Use the toolbar to style or structure your draft.',
            hint: 'After one formatting action, onboarding is complete.',
            primaryLabel: 'Finish onboarding',
          };

  const calloutStyle: CSSProperties =
    stage === 'formattingHint'
      ? {
          position: 'fixed',
          top: spotlight ? Math.min(viewportHeight - 220, spotlight.top + spotlight.height + 16) : 24,
          left: 24,
          width: 'min(360px, calc(100vw - 48px))',
          zIndex: 151,
        }
      : stage === 'welcome'
        ? {
            position: 'fixed',
            top: spotlight ? Math.max(24, spotlight.top - 170) : 24,
            left: 24,
            width: 'min(360px, calc(100vw - 48px))',
            zIndex: 151,
          }
      : {
          position: 'fixed',
          left: 24,
          bottom: 24,
          width: 'min(360px, calc(100vw - 48px))',
          zIndex: 151,
        };

  const spotlightRadius = spotlight
    ? Math.max(0, Math.min(spotlightCornerRadius, spotlight.width / 2, spotlight.height / 2))
    : 0;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[140] onboarding-coachmark-backdrop">
        {spotlight && viewportWidth > 0 && viewportHeight > 0 ? (
          <>
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              style={{ pointerEvents: 'none' }}
            >
              <defs>
                <mask
                  id={spotlightMaskId}
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                  x={0}
                  y={0}
                  width={viewportWidth}
                  height={viewportHeight}
                >
                  <rect x="0" y="0" width={viewportWidth} height={viewportHeight} fill="white" />
                  <rect
                    x={spotlight.left}
                    y={spotlight.top}
                    width={spotlight.width}
                    height={spotlight.height}
                    rx={spotlightRadius}
                    ry={spotlightRadius}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect
                className="onboarding-coachmark-mask"
                x="0"
                y="0"
                width={viewportWidth}
                height={viewportHeight}
                mask={`url(#${spotlightMaskId})`}
              />
            </svg>
            <div
              className="pointer-events-none absolute onboarding-coachmark-spotlight"
              style={{
                top: spotlight.top,
                left: spotlight.left,
                width: spotlight.width,
                height: spotlight.height,
                borderRadius: `${spotlightRadius}px`,
              }}
            />
          </>
        ) : (
          <div className="pointer-events-auto absolute inset-0 onboarding-coachmark-mask" />
        )}
      </div>

      <div className="onboarding-coachmark-card" style={calloutStyle}>
        <p className="onboarding-coachmark-progress">{content.progress}</p>
        <h3 className="onboarding-coachmark-title">{content.title}</h3>
        <p className="onboarding-coachmark-body">{content.body}</p>
        <p className="onboarding-coachmark-hint">{content.hint}</p>
        <div className="onboarding-coachmark-actions">
          {content.primaryLabel ? (
            <button type="button" onClick={onFinish} className="onboarding-coachmark-primary">
              {content.primaryLabel}
            </button>
          ) : null}
          <button type="button" onClick={onSkip} className="onboarding-coachmark-secondary">
            Skip onboarding
          </button>
        </div>
      </div>
    </>
  );
}
